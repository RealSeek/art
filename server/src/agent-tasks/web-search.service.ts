import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, WebSearchChannel, WebSearchProviderType } from '@prisma/client'
import { load } from 'cheerio'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { defaultWebSearchPresets, webSearchPresetData } from './default-web-search-presets'
import { PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { fetchNoRedirect, fetchPublicManualRedirect, fetchPublicNoRedirect } from '../common/outbound-http'

type SearchInput = { query: string; maxResults?: number; topic?: string; includeDomains?: string[]; excludeDomains?: string[]; timeoutMs?: number; signal?: AbortSignal }
type SearchResult = { title: string; url: string; content: string; publishedAt?: string; score?: number; source?: string }
type ChannelInput = {
  name: string; type: WebSearchProviderType; endpoint?: string; apiKey?: string; enabled?: boolean; priority?: number
  timeoutMs?: number; maxResults?: number; config?: Record<string, unknown>; clearApiKey?: boolean
}
type TgmengInput = {
  license?: string
  recommendationEnabled?: boolean
  fallbackEnabled?: boolean
  rootCategories?: string[]
  recommendationLimit?: number
  cacheMinutes?: number
}
type DailyHotInput = {
  endpoint?: string
  recommendationEnabled?: boolean
  sources?: string[]
  recommendationLimit?: number
  cacheMinutes?: number
}
type RecommendationItem = { title: string; prompt: string; targetUrl: string; source: string; category: string; publishedAt: string; sourceUrl?: string }
type RecommendationFeed = { enabled: boolean; items: RecommendationItem[]; updatedAt?: string; stale?: boolean; limit?: number }
type RecommendationSnapshot = { enabled: boolean; pool: RecommendationItem[]; limit: number; updatedAt?: string; stale: boolean; providers: string[] }

const TGMENG_ENDPOINT = 'https://trendapi.tgmeng.com/api/skill/search'
const TGMENG_CATEGORIES = ['新闻', '羊毛', '媒体', '电视', '生活', '社区', '财经', '股讯', '体育', '科技', '设计', '影音', '游戏', '健康', '教育', '期货', 'AI', '副业']
const DAILY_HOT_DEFAULT_ENDPOINT = 'http://dailyhot:6688'
export const DAILY_HOT_SOURCES = [
  ['weibo', '微博'], ['zhihu', '知乎'], ['baidu', '百度'], ['douyin', '抖音'], ['bilibili', '哔哩哔哩'], ['toutiao', '今日头条'],
  ['thepaper', '澎湃新闻'], ['qq-news', '腾讯新闻'], ['netease-news', '网易新闻'], ['sina-news', '新浪新闻'], ['36kr', '36氪'], ['huxiu', '虎嗅'],
  ['ithome', 'IT之家'], ['sspai', '少数派'], ['juejin', '稀土掘金'], ['csdn', 'CSDN'], ['51cto', '51CTO'], ['geekpark', '极客公园'],
  ['ifanr', '爱范儿'], ['producthunt', 'Product Hunt'], ['hackernews', 'Hacker News'], ['github', 'GitHub'], ['hellogithub', 'HelloGitHub'], ['linuxdo', 'Linux.do'],
  ['nodeseek', 'NodeSeek'], ['v2ex', 'V2EX'], ['52pojie', '吾爱破解'], ['hostloc', '全球主机交流'], ['coolapk', '酷安'], ['tieba', '百度贴吧'],
  ['douban-movie', '豆瓣电影'], ['douban-group', '豆瓣小组'], ['kuaishou', '快手'], ['acfun', 'AcFun'], ['hupu', '虎扑'], ['ngabbs', 'NGA'],
  ['weread', '微信读书'], ['jianshu', '简书'], ['guokr', '果壳'], ['smzdm', '什么值得买'], ['newsmth', '水木社区'], ['nytimes', '纽约时报'],
  ['yystv', '游研社'], ['gameres', '游戏葡萄'], ['lol', '英雄联盟'], ['miyoushe', '米游社'], ['genshin', '原神'], ['starrail', '崩坏：星穹铁道'],
  ['honkai', '崩坏3'], ['weatheralarm', '气象预警'], ['earthquake', '地震速报'], ['history', '历史上的今天'],
] as const
export const DAILY_HOT_SOURCE_IDS = DAILY_HOT_SOURCES.map(([id]) => id)
const DAILY_HOT_SOURCE_SET = new Set<string>(DAILY_HOT_SOURCE_IDS)
const DAILY_HOT_SOURCE_LABELS = Object.fromEntries(DAILY_HOT_SOURCES)
const DAILY_HOT_DEFAULT_SOURCES = ['weibo', 'zhihu', 'baidu', 'douyin', 'bilibili', '36kr', 'ithome', 'juejin']
const TRACKING_QUERY_KEYS = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'ref_src', 'spm', 'from', 'source'])
const MAX_PAGE_BYTES = 1_000_000
const MAX_PAGE_TEXT = 6_000
const MAX_ENRICHED_RESULTS = 5
const MAX_ENRICHED_TEXT = 20_000

const endpoints: Record<WebSearchProviderType, string> = {
  SEARXNG: '',
  TAVILY: 'https://api.tavily.com/search',
  SERPER: 'https://google.serper.dev/search',
  BRAVE: 'https://api.search.brave.com/res/v1/web/search',
  EXA: 'https://api.exa.ai/search',
  CUSTOM: '',
}

@Injectable()
export class WebSearchService {
  private tgmengCache: { expiresAt: number; value: RecommendationFeed } | null = null
  private tgmengRefresh: Promise<RecommendationFeed> | null = null
  private dailyHotRefresh: Promise<RecommendationFeed> | null = null
  private recommendationSnapshot: { expiresAt: number; value: RecommendationSnapshot } | null = null

  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly endpointPolicy: PublicEndpointPolicyService) {}

  async isAvailable() {
    const channels = await this.prisma.webSearchChannel.findMany({ where: { enabled: true, endpoint: { not: '' } } })
    if (channels.some((channel) => !this.isDailyHot(channel) && (!this.isTgmeng(channel) || this.record(channel.config).fallbackEnabled === true) && (channel.type === WebSearchProviderType.CUSTOM || channel.type === WebSearchProviderType.SEARXNG || Boolean(channel.encryptedApiKey)))) return true
    return false
  }

  async search(input: SearchInput) {
    const query = input.query.trim()
    if (!query) return { query, results: [], message: '搜索词为空', sources: [] }
    const now = new Date()
    const channels = await this.prisma.webSearchChannel.findMany({
      where: { enabled: true }, orderBy: [{ priority: 'desc' }, { consecutiveFailures: 'asc' }, { createdAt: 'asc' }],
    })
    const eligible = channels.filter((channel) => !this.isDailyHot(channel) && (!this.isTgmeng(channel) || this.record(channel.config).fallbackEnabled === true) && (!channel.cooldownUntil || channel.cooldownUntil <= now))
    const primaryChannels = eligible.filter((channel) => !this.isTgmeng(channel))
    const fallbackChannels = eligible.filter((channel) => this.isTgmeng(channel))
    const errors: string[] = channels.length && !eligible.length ? ['已配置渠道均处于故障冷却期'] : []
    const tryChannels = async (candidates: WebSearchChannel[]) => {
      for (const channel of candidates) {
        try {
          const output = await this.execute(channel, input)
          if (!output.results.length) throw new Error('搜索服务未返回可用结果')
          await this.markSuccess(channel.id, output.results.length)
          return { ...output, query, channel: { id: channel.id, name: channel.name, type: channel.type }, fallbackCount: errors.length, sources: output.results.map(({ title, url }) => ({ title, url })) }
        } catch (reason) {
          if (input.signal?.aborted) throw reason
          const message = reason instanceof Error ? reason.message : '搜索失败'
          errors.push(`${channel.name}: ${message}`)
          await this.markFailure(channel.id, message)
        }
      }
      return null
    }
    const primary = await tryChannels(primaryChannels)
    if (primary) return primary
    const fallback = await tryChannels(fallbackChannels)
    if (fallback) return fallback
    throw new Error(`所有联网搜索渠道均不可用${errors.length ? `：${errors.join('；')}` : '，请在管理端配置搜索渠道'}`)
  }

  canonicalizeUrl(value: string) { return this.normalizeWebUrl(value) }

  async resolveSources(input: Array<{ title: string; url: string; publishedAt?: string }>) {
    const seen = new Set<string>()
    const sources = input.flatMap((item) => {
      const url = this.normalizeWebUrl(item.url)
      if (!url || seen.has(url)) return []
      seen.add(url)
      return [{ title: String(item.title || url).trim().slice(0, 300), url, publishedAt: item.publishedAt ? String(item.publishedAt).slice(0, 100) : undefined }]
    }).slice(0, 3)
    return Promise.all(sources.map(async (source) => {
      const page = await this.extractPage(source.url).catch(() => null)
      return {
        title: page?.title || source.title || source.url,
        url: page?.url || source.url,
        content: page?.content || undefined,
        publishedAt: page?.publishedAt || source.publishedAt,
      }
    }))
  }

  list() { return this.prisma.webSearchChannel.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }).then((rows) => rows.filter((row) => !this.isSystemRecommendation(row)).map((row) => this.publicChannel(row))) }

  async restoreDefaults() {
    const result = await this.prisma.webSearchChannel.createMany({
      data: defaultWebSearchPresets.map(webSearchPresetData),
      skipDuplicates: true,
    })
    return { added: result.count, total: defaultWebSearchPresets.length }
  }

  async dailyHotSettings() {
    const row = await this.findDailyHot()
    const config = this.record(row?.config)
    return {
      endpoint: row?.endpoint || DAILY_HOT_DEFAULT_ENDPOINT,
      availableSources: DAILY_HOT_SOURCES.map(([id, name]) => ({ id, name })),
      recommendationEnabled: config.recommendationEnabled === true,
      sources: this.dailyHotSources(config.sources),
      recommendationLimit: Math.min(12, Math.max(3, Number(config.recommendationLimit || 8))),
      cacheMinutes: Math.min(1440, Math.max(5, Number(config.cacheMinutes || 30))),
      cachedCount: Array.isArray(config.cachedItems) ? config.cachedItems.length : 0,
      cacheUpdatedAt: typeof config.cacheUpdatedAt === 'string' ? config.cacheUpdatedAt : '',
      lastHealthStatus: row?.lastHealthStatus || null,
      lastHealthMessage: row?.lastHealthMessage || '',
      lastSuccessAt: row?.lastSuccessAt || null,
    }
  }

  async saveDailyHot(input: DailyHotInput) {
    const current = await this.findDailyHot()
    const currentConfig = this.record(current?.config)
    const endpoint = (input.endpoint ?? current?.endpoint ?? DAILY_HOT_DEFAULT_ENDPOINT).trim().replace(/\/+$/, '')
    if (!this.normalizeWebUrl(endpoint)) throw new BadRequestException('DailyHot API 地址无效')
    await this.assertSearchEndpoint(endpoint, 'dailyhot')
    const config = {
      integration: 'dailyhot',
      recommendationEnabled: input.recommendationEnabled ?? currentConfig.recommendationEnabled === true,
      sources: this.dailyHotSources(input.sources ?? currentConfig.sources),
      recommendationLimit: Math.min(12, Math.max(3, Number(input.recommendationLimit ?? currentConfig.recommendationLimit ?? 8))),
      cacheMinutes: Math.min(1440, Math.max(5, Number(input.cacheMinutes ?? currentConfig.cacheMinutes ?? 30))),
      cachedItems: currentConfig.cachedItems,
      cacheUpdatedAt: currentConfig.cacheUpdatedAt,
    }
    const data = {
      name: 'DailyHot 多源热榜', type: WebSearchProviderType.CUSTOM, endpoint, encryptedApiKey: '', apiKeyHint: '',
      enabled: config.recommendationEnabled, priority: -11000, timeoutMs: 8000, maxResults: config.recommendationLimit,
      config: config as Prisma.InputJsonValue, lastHealthStatus: null, lastHealthMessage: '', cooldownUntil: null, consecutiveFailures: 0,
    }
    if (current) await this.prisma.webSearchChannel.update({ where: { id: current.id }, data })
    else await this.prisma.webSearchChannel.create({ data })
    this.recommendationSnapshot = null
    return this.dailyHotSettings()
  }

  async checkDailyHot() {
    const row = await this.findDailyHot()
    if (!row) throw new BadRequestException('请先保存 DailyHot 配置')
    const source = this.dailyHotSources(this.record(row.config).sources)[0]
    const started = Date.now()
    try {
      const output = await this.executeDailyHot(row.endpoint, source, row.timeoutMs)
      if (!output.length) throw new Error(`${DAILY_HOT_SOURCE_LABELS[source]}没有返回内容`)
      await this.markSuccess(row.id, output.length, `连接正常，${DAILY_HOT_SOURCE_LABELS[source]}返回 ${output.length} 条，${Date.now() - started}ms`)
      return { healthy: true, latencyMs: Date.now() - started, resultCount: output.length, source }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '连接失败'
      await this.markFailure(row.id, message)
      throw new BadRequestException(message)
    }
  }

  async tgmengSettings() {
    const row = await this.findTgmeng()
    const config = this.record(row?.config)
    return {
      endpoint: TGMENG_ENDPOINT,
      categories: TGMENG_CATEGORIES,
      hasLicense: Boolean(row?.encryptedApiKey),
      licenseHint: row?.apiKeyHint || '',
      recommendationEnabled: config.recommendationEnabled === true,
      fallbackEnabled: config.fallbackEnabled === true,
      rootCategories: this.categories(config.rootCategories),
      recommendationLimit: Math.min(12, Math.max(3, Number(config.recommendationLimit || 6))),
      cacheMinutes: Math.min(1440, Math.max(1, Number(config.cacheMinutes || 10))),
      lastHealthStatus: row?.lastHealthStatus || null,
      lastHealthMessage: row?.lastHealthMessage || '',
      lastSuccessAt: row?.lastSuccessAt || null,
    }
  }

  async saveTgmeng(input: TgmengInput) {
    const current = await this.findTgmeng()
    const license = input.license?.trim() || ''
    if (!current && !license) throw new BadRequestException('请填写糖果梦通用密钥')
    const recommendationEnabled = input.recommendationEnabled ?? (this.record(current?.config).recommendationEnabled === true)
    const fallbackEnabled = input.fallbackEnabled ?? (this.record(current?.config).fallbackEnabled === true)
    const config = {
      integration: 'tgmeng',
      recommendationEnabled,
      fallbackEnabled,
      rootCategories: this.categories(input.rootCategories ?? this.record(current?.config).rootCategories),
      recommendationLimit: Math.min(12, Math.max(3, Number(input.recommendationLimit ?? this.record(current?.config).recommendationLimit ?? 6))),
      cacheMinutes: Math.min(1440, Math.max(1, Number(input.cacheMinutes ?? this.record(current?.config).cacheMinutes ?? 10))),
      cachedItems: this.record(current?.config).cachedItems,
      cacheUpdatedAt: this.record(current?.config).cacheUpdatedAt,
    }
    const encryptedApiKey = license ? this.crypto.encrypt(license) : current?.encryptedApiKey || ''
    const data = {
      name: '糖果梦热榜', type: WebSearchProviderType.CUSTOM, endpoint: TGMENG_ENDPOINT, encryptedApiKey,
      apiKeyHint: license ? this.crypto.hint(license) : current?.apiKeyHint || '', enabled: recommendationEnabled || fallbackEnabled,
      priority: -10000, timeoutMs: 15000, maxResults: config.recommendationLimit, config: config as Prisma.InputJsonValue,
      lastHealthStatus: null, lastHealthMessage: '', cooldownUntil: null, consecutiveFailures: 0,
    }
    if (current) await this.prisma.webSearchChannel.update({ where: { id: current.id }, data })
    else await this.prisma.webSearchChannel.create({ data })
    this.tgmengCache = null
    this.recommendationSnapshot = null
    return this.tgmengSettings()
  }

  async checkTgmeng() {
    const row = await this.findTgmeng()
    if (!row?.encryptedApiKey) throw new BadRequestException('请先保存糖果梦通用密钥')
    const started = Date.now()
    try {
      const output = await this.executeTgmeng(row, { query: '', maxResults: 3 })
      if (!output.results.length) throw new Error('连接成功，但实时热榜没有返回内容')
      await this.markSuccess(row.id, output.results.length, `连接正常，返回 ${output.results.length} 条热榜，${Date.now() - started}ms`)
      return { healthy: true, latencyMs: Date.now() - started, resultCount: output.results.length }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '连接失败'
      await this.markFailure(row.id, message)
      throw new BadRequestException(message)
    }
  }

  async refreshTgmeng() { this.recommendationSnapshot = null; return this.tgmengRecommendations(true) }
  async refreshDailyHot() { this.recommendationSnapshot = null; return this.dailyHotRecommendations(true) }

  async recommendations(force = false) {
    if (!force && this.recommendationSnapshot && this.recommendationSnapshot.expiresAt > Date.now()) return this.presentRecommendations(this.recommendationSnapshot.value)
    const [dailyHot, tgmeng] = await Promise.all([this.dailyHotRecommendations(force), this.tgmengRecommendations(force)])
    const pool: RecommendationItem[] = []
    const seen = new Set<string>()
    for (const item of [...dailyHot.items, ...tgmeng.items]) {
      const key = item.title.trim().toLocaleLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      pool.push(item)
      if (pool.length >= 240) break
    }
    const enabled = dailyHot.enabled || tgmeng.enabled
    const limit = Math.min(12, Math.max(3, dailyHot.limit || tgmeng.limit || 8))
    const snapshot = {
      enabled,
      pool,
      limit,
      updatedAt: [dailyHot.updatedAt, tgmeng.updatedAt].filter(Boolean).sort().at(-1),
      stale: Boolean(enabled && ((dailyHot.enabled && dailyHot.stale) || (tgmeng.enabled && tgmeng.stale))),
      providers: [dailyHot.enabled ? 'dailyhot' : '', tgmeng.enabled ? 'tgmeng' : ''].filter(Boolean),
    }
    this.recommendationSnapshot = { expiresAt: Date.now() + 300_000, value: snapshot }
    return this.presentRecommendations(snapshot)
  }

  private async tgmengRecommendations(force = false): Promise<RecommendationFeed> {
    const row = await this.findTgmeng()
    const config = this.record(row?.config)
    if (!row?.enabled || !row.encryptedApiKey || config.recommendationEnabled !== true) return { enabled: false, items: [] }
    if (!force && this.tgmengCache && this.tgmengCache.expiresAt > Date.now()) return this.tgmengCache.value
    const limit = Math.min(12, Math.max(3, Number(config.recommendationLimit || 6)))
    const cacheMinutes = Math.min(1440, Math.max(1, Number(config.cacheMinutes || 10)))
    const cachedItems = this.recommendationItems(config.cachedItems)
    const cacheUpdatedAt = typeof config.cacheUpdatedAt === 'string' ? config.cacheUpdatedAt : ''
    const cacheAge = cacheUpdatedAt ? Date.now() - new Date(cacheUpdatedAt).getTime() : Number.POSITIVE_INFINITY
    if (!force && cachedItems.length) {
      const stale = !Number.isFinite(cacheAge) || cacheAge >= cacheMinutes * 60_000
      const value = { enabled: true, items: cachedItems, updatedAt: cacheUpdatedAt, stale, limit }
      this.tgmengCache = { expiresAt: stale ? Date.now() + 30_000 : Date.now() + Math.max(1_000, cacheMinutes * 60_000 - cacheAge), value }
      if (stale) void this.refreshTgmengCache(row, config, cachedItems)
      return value
    }
    if (!force) {
      const value = { enabled: true, items: [] as RecommendationItem[], stale: true, limit }
      this.tgmengCache = { expiresAt: Date.now() + 300_000, value }
      void this.refreshTgmengCache(row, config, cachedItems)
      return value
    }
    return this.refreshTgmengCache(row, config, cachedItems)
  }

  private refreshTgmengCache(row: WebSearchChannel, config: Record<string, unknown>, cachedItems: RecommendationItem[]) {
    if (this.tgmengRefresh) return this.tgmengRefresh
    this.tgmengRefresh = this.fetchTgmengRecommendations(row, config, cachedItems).finally(() => { this.tgmengRefresh = null })
    return this.tgmengRefresh
  }

  private async fetchTgmengRecommendations(row: WebSearchChannel, config: Record<string, unknown>, cachedItems: RecommendationItem[]): Promise<RecommendationFeed> {
    try {
      const limit = Math.min(12, Math.max(3, Number(config.recommendationLimit || 6)))
      const poolLimit = Math.min(60, Math.max(limit * 6, 24))
      const output = await this.executeTgmeng(row, { query: '', maxResults: poolLimit, timeoutMs: 4000 })
      const items = output.results.slice(0, poolLimit).map((item) => ({
        title: item.title,
        prompt: `请联网搜索并介绍这个热点：${item.title}`,
        targetUrl: '',
        source: item.source || '',
        category: item.rootCategory || '',
        publishedAt: item.publishedAt || '',
      }))
      const updatedAt = new Date().toISOString()
      const value = { enabled: true, items, updatedAt, stale: false, limit }
      this.tgmengCache = { expiresAt: Date.now() + Math.min(1440, Math.max(1, Number(config.cacheMinutes || 10))) * 60_000, value }
      await this.prisma.webSearchChannel.update({ where: { id: row.id }, data: { config: { ...config, cachedItems: items, cacheUpdatedAt: updatedAt } as Prisma.InputJsonValue } })
      await this.markSuccess(row.id, items.length)
      this.recommendationSnapshot = null
      return value
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '热点接口请求失败'
      await this.markFailure(row.id, message)
      const value = this.tgmengCache?.value.items.length
        ? { ...this.tgmengCache.value, stale: true }
        : { enabled: true, items: cachedItems, stale: true, limit: Math.min(12, Math.max(3, Number(config.recommendationLimit || 6))) }
      this.tgmengCache = { expiresAt: Date.now() + 300_000, value }
      return value
    }
  }

  private async dailyHotRecommendations(force = false): Promise<RecommendationFeed> {
    const row = await this.findDailyHot()
    const config = this.record(row?.config)
    if (!row?.enabled || config.recommendationEnabled !== true) return { enabled: false, items: [] }
    const cacheMinutes = Math.min(1440, Math.max(5, Number(config.cacheMinutes || 30)))
    const cachedItems = this.recommendationItems(config.cachedItems)
    const cacheUpdatedAt = typeof config.cacheUpdatedAt === 'string' ? config.cacheUpdatedAt : ''
    const cacheAge = cacheUpdatedAt ? Date.now() - new Date(cacheUpdatedAt).getTime() : Number.POSITIVE_INFINITY
    const limit = Math.min(12, Math.max(3, Number(config.recommendationLimit || 8)))
    if (!force && cachedItems.length) {
      const stale = !Number.isFinite(cacheAge) || cacheAge >= cacheMinutes * 60_000
      if (stale) void this.refreshDailyHotCache(row, config, cachedItems)
      return { enabled: true, items: cachedItems, updatedAt: cacheUpdatedAt, stale, limit }
    }
    return this.refreshDailyHotCache(row, config, cachedItems)
  }

  private refreshDailyHotCache(row: WebSearchChannel, config: Record<string, unknown>, cachedItems: RecommendationItem[]) {
    if (this.dailyHotRefresh) return this.dailyHotRefresh
    this.dailyHotRefresh = this.fetchDailyHotRecommendations(row, config, cachedItems).finally(() => { this.dailyHotRefresh = null })
    return this.dailyHotRefresh
  }

  private async fetchDailyHotRecommendations(row: WebSearchChannel, config: Record<string, unknown>, cachedItems: RecommendationItem[]): Promise<RecommendationFeed> {
    const sources = this.dailyHotSources(config.sources)
    const limit = Math.min(12, Math.max(3, Number(config.recommendationLimit || 8)))
    const cacheUpdatedAt = typeof config.cacheUpdatedAt === 'string' ? config.cacheUpdatedAt : ''
    const settled = await Promise.allSettled(sources.map(async (source) => ({ source, rows: await this.executeDailyHot(row.endpoint, source, row.timeoutMs) })))
    const available = settled.flatMap((result) => result.status === 'fulfilled' && result.value.rows.length ? [result.value] : [])
    if (!available.length) {
      const errors = settled.flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : '请求失败'] : [])
      await this.markFailure(row.id, errors[0] || 'DailyHot 已启用的榜单均未返回内容')
      return { enabled: true, items: cachedItems, updatedAt: cacheUpdatedAt || undefined, stale: true, limit }
    }
    const items: RecommendationItem[] = []
    const seen = new Set<string>()
    const poolLimit = Math.min(240, Math.max(limit * 6, sources.length * 12))
    for (let index = 0; items.length < poolLimit; index += 1) {
      let added = false
      for (const result of available) {
        const item = result.rows[index]
        if (!item) continue
        const key = item.title.trim().toLocaleLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        items.push({
          title: item.title,
          prompt: `请联网搜索并介绍这个热点：${item.title}`,
          targetUrl: '',
          source: DAILY_HOT_SOURCE_LABELS[result.source] || result.source,
          category: '实时热榜',
          publishedAt: item.publishedAt || '',
          sourceUrl: item.url,
        })
        added = true
        if (items.length >= poolLimit) break
      }
      if (!added) break
    }
    const updatedAt = new Date().toISOString()
    const nextConfig = { ...config, cachedItems: items, cacheUpdatedAt: updatedAt }
    await this.prisma.webSearchChannel.update({ where: { id: row.id }, data: { config: nextConfig as Prisma.InputJsonValue } })
    const failedCount = settled.length - available.length
    await this.markSuccess(row.id, items.length, `已刷新 ${available.length}/${settled.length} 个榜单，共 ${items.length} 条${failedCount ? `，${failedCount} 个榜单暂不可用` : ''}`)
    this.recommendationSnapshot = null
    return { enabled: true, items, updatedAt, stale: false, limit }
  }

  private presentRecommendations(snapshot: RecommendationSnapshot) {
    return { ...snapshot, items: this.shuffle(snapshot.pool).slice(0, snapshot.limit) }
  }

  private shuffle<T>(items: T[]) {
    const output = [...items]
    for (let index = output.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1))
      ;[output[index], output[next]] = [output[next], output[index]]
    }
    return output
  }

  async create(input: ChannelInput) {
    const row = await this.prisma.webSearchChannel.create({ data: await this.channelData(input) })
    return this.publicChannel(row)
  }

  async update(id: string, input: Partial<ChannelInput>) {
    const current = await this.prisma.webSearchChannel.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('搜索渠道不存在')
    const encryptedApiKey = input.clearApiKey ? '' : input.apiKey ? this.crypto.encrypt(input.apiKey) : current.encryptedApiKey
    const nextType = input.type || current.type
    const nextEndpoint = input.endpoint === undefined && input.type === undefined
      ? current.endpoint
      : (input.endpoint ?? endpoints[nextType]).trim()
    const nextConfig = input.config === undefined ? current.config : input.config
    // Keep the existing disabled SearXNG preset editable while its endpoint
    // is intentionally blank; execution still fails closed when no endpoint
    // has been configured.
    if (nextEndpoint) await this.assertSearchEndpoint(nextEndpoint, this.integration(nextConfig as Prisma.JsonValue))
    const row = await this.prisma.webSearchChannel.update({ where: { id }, data: {
      ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.endpoint === undefined && input.type === undefined ? {} : { endpoint: nextEndpoint }),
      ...(input.apiKey === undefined && !input.clearApiKey ? {} : { encryptedApiKey, apiKeyHint: encryptedApiKey ? this.crypto.hint(input.apiKey || this.crypto.decrypt(encryptedApiKey)) : '' }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }), ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }), ...(input.maxResults === undefined ? {} : { maxResults: input.maxResults }),
      ...(input.config === undefined ? {} : { config: input.config as Prisma.InputJsonValue }),
      lastHealthStatus: null, lastHealthMessage: '', cooldownUntil: null, consecutiveFailures: 0,
    } })
    return this.publicChannel(row)
  }

  async remove(id: string) { await this.prisma.webSearchChannel.delete({ where: { id } }).catch(() => { throw new NotFoundException('搜索渠道不存在') }); return { deleted: true } }

  async check(id: string) {
    const channel = await this.prisma.webSearchChannel.findUnique({ where: { id } })
    if (!channel) throw new NotFoundException('搜索渠道不存在')
    const started = Date.now()
    try {
      const output = await this.execute(channel, { query: 'OpenAI', maxResults: 3 })
      if (!output.results.length) throw new Error('连接成功，但没有返回可用的搜索结果')
      await this.markSuccess(channel.id, output.results.length, `连接正常，返回 ${output.results.length} 条结果，${Date.now() - started}ms`)
      return { healthy: true, latencyMs: Date.now() - started, resultCount: output.results.length }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '连接失败'
      await this.markFailure(channel.id, message)
      throw new BadRequestException(message)
    }
  }

  async checkAll() {
    const channels = await this.prisma.webSearchChannel.findMany({ where: { enabled: true } })
    const rows = channels.filter((row) => !this.isSystemRecommendation(row)).map(({ id, name }) => ({ id, name }))
    const results = await Promise.all(rows.map(async (row) => { try { return { id: row.id, name: row.name, ...await this.check(row.id) } } catch (reason) { return { id: row.id, name: row.name, healthy: false, error: reason instanceof Error ? reason.message : '连接失败' } } }))
    return { checked: results.length, healthy: results.filter((item) => item.healthy).length, unhealthy: results.filter((item) => !item.healthy).length, results }
  }

  private async execute(channel: WebSearchChannel, input: SearchInput) {
    if (input.signal?.aborted) throw new Error('搜索任务已取消')
    if (this.isTgmeng(channel)) return this.enrichOutput(await this.executeTgmeng(channel, input), input.signal)
    const apiKey = channel.encryptedApiKey ? this.crypto.decrypt(channel.encryptedApiKey) : ''
    if (!apiKey && channel.type !== WebSearchProviderType.CUSTOM && channel.type !== WebSearchProviderType.SEARXNG) throw new Error('未配置 API 密钥')
    const maxResults = Math.min(20, Math.max(1, input.maxResults || channel.maxResults))
    let endpoint = channel.endpoint || endpoints[channel.type]
    if (!endpoint) throw new Error('未配置搜索地址')
    const config = this.record(channel.config)
    if (channel.type === 'BRAVE') endpoint = `${endpoint}?${new URLSearchParams({ q: input.query, count: String(maxResults), ...(input.topic === 'news' ? { freshness: 'pm' } : {}) })}`
    if (channel.type === 'SEARXNG') {
      const url = new URL(endpoint)
      url.searchParams.set('q', input.query)
      url.searchParams.set('format', 'json')
      if (input.topic === 'news') url.searchParams.set('categories', 'news')
      endpoint = url.toString()
    }
    if (channel.type === 'CUSTOM' && String(config.method || 'POST').toUpperCase() === 'GET') {
      const url = new URL(endpoint)
      url.searchParams.set(String(config.queryParam || 'query'), input.query)
      url.searchParams.set(String(config.maxResultsParam || 'max_results'), String(maxResults))
      endpoint = url.toString()
    }
    // Validate again immediately before the network request. Rows can be
    // imported or changed outside the admin API, so write-time validation is
    // not sufficient to protect the worker's egress boundary.
    endpoint = (await this.assertSearchEndpoint(endpoint, this.integration(channel.config))).toString()
    const init = this.request(channel.type, apiKey, input, maxResults, config)
    const response = await fetchPublicNoRedirect(endpoint, { ...init, signal: this.combineSignal(input.signal, Math.min(60_000, Math.max(1000, channel.timeoutMs))) })
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(text) as Record<string, unknown> } catch { throw new Error('搜索服务返回的不是有效 JSON') }
    return this.enrichOutput(this.normalize(channel.type, payload, maxResults, config), input.signal)
  }

  private async executeTgmeng(channel: WebSearchChannel, input: SearchInput) {
    const license = channel.encryptedApiKey ? this.crypto.decrypt(channel.encryptedApiKey) : ''
    if (!license) throw new Error('未配置糖果梦通用密钥')
    const config = this.record(channel.config)
    const query = input.query.trim()
    const maxResults = Math.min(20, Math.max(1, input.maxResults || channel.maxResults))
    let response: Response
    try {
      response = await fetchPublicNoRedirect(TGMENG_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: this.combineSignal(input.signal, Math.min(60_000, Math.max(1000, input.timeoutMs ?? channel.timeoutMs))),
        body: JSON.stringify({ license, keywords: query ? [query] : [], mode: 'REALTIME', rootCategories: query ? [] : this.categories(config.rootCategories), limit: maxResults, offset: 0, distinct: true }),
      })
    } catch (reason) {
      throw new Error(`无法连接糖果梦接口：${this.networkError(reason)}`)
    }
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(text) as Record<string, unknown> } catch { throw new Error('糖果梦返回的不是有效 JSON') }
    if (Number(payload.code) !== 200) throw new Error(String(payload.message || '糖果梦业务请求失败').slice(0, 300))
    const data = this.record(payload.data as Prisma.JsonValue)
    const raw = Array.isArray(data.items) ? data.items : []
    const results = raw.slice(0, maxResults).map((item) => {
      const row = this.record(item as Prisma.JsonValue)
      const source = String(row.source || '')
      const category = String(row.category || '')
      const rootCategory = String(row.rootCategory || '')
      return {
        title: String(row.title || '').trim(), url: this.normalizeWebUrl(String(row.url || '')),
        content: [source ? `来源：${source}` : '', rootCategory || category ? `分类：${rootCategory || category}` : '', Number.isFinite(Number(row.rank)) ? `榜单排名：${Number(row.rank)}` : ''].filter(Boolean).join('；'),
        publishedAt: row.publishedAt ? String(row.publishedAt) : undefined, source, category, rootCategory,
      }
    }).filter((item) => Boolean(item.title) && (!query || Boolean(item.url)))
    return { results }
  }

  private async executeDailyHot(endpoint: string, source: string, timeoutMs: number) {
    const sourceId = this.dailyHotSources([source])[0]
    const validated = await this.assertSearchEndpoint(endpoint, 'dailyhot')
    const url = `${validated.toString().replace(/\/+$/, '')}/${sourceId}`
    let response: Response
    try {
      const request = this.isBuiltInDailyHotEndpoint(validated.toString()) ? fetchNoRedirect : fetchPublicNoRedirect
      response = await request(url, { headers: { Accept: 'application/json', 'User-Agent': 'OnlyArt/1.0' }, signal: AbortSignal.timeout(Math.min(30_000, Math.max(1000, timeoutMs))) })
    } catch (reason) {
      throw new Error(`${DAILY_HOT_SOURCE_LABELS[sourceId]}：${this.networkError(reason)}`)
    }
    const text = await response.text()
    if (!response.ok) throw new Error(`${DAILY_HOT_SOURCE_LABELS[sourceId]}：HTTP ${response.status}: ${text.slice(0, 240)}`)
    let payload: Record<string, unknown>
    try { payload = JSON.parse(text) as Record<string, unknown> } catch { throw new Error(`${DAILY_HOT_SOURCE_LABELS[sourceId]}返回的不是有效 JSON`) }
    const raw = Array.isArray(payload.data) ? payload.data : []
    return raw.slice(0, 30).map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        title: String(row.title || '').trim(),
        url: this.normalizeWebUrl(String(row.url || row.mobileUrl || '')),
        publishedAt: row.timestamp ? String(row.timestamp) : '',
      }
    }).filter((item) => item.title && item.url)
  }

  private request(type: WebSearchProviderType, apiKey: string, input: SearchInput, maxResults: number, config: Record<string, unknown>): RequestInit {
    if (type === 'SEARXNG') return { method: 'GET', headers: { Accept: 'application/json' } }
    if (type === 'BRAVE') {
      return { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey } }
    }
    if (type === 'SERPER') return { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey }, body: JSON.stringify({ q: input.query, num: maxResults, ...(input.topic === 'news' ? { type: 'news' } : {}), ...config }) }
    if (type === 'EXA') return { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ query: input.query, numResults: maxResults, contents: { text: { maxCharacters: 3000 } }, includeDomains: input.includeDomains, excludeDomains: input.excludeDomains, ...config }) }
    if (type === 'CUSTOM') {
      const method = String(config.method || 'POST').toUpperCase()
      const headers = { 'Content-Type': 'application/json', ...(this.record(config.headers as Prisma.JsonValue) || {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }
      return { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify({ query: input.query, max_results: maxResults, ...config.body as object }) }) }
    }
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: input.query, max_results: maxResults, search_depth: config.searchDepth || 'advanced', include_answer: true, include_domains: input.includeDomains, exclude_domains: input.excludeDomains, api_key: apiKey }) }
  }

  private normalize(type: WebSearchProviderType, payload: Record<string, unknown>, maxResults: number, config: Record<string, unknown>) {
    const answerValue = type === 'CUSTOM' && typeof config.answerPath === 'string' ? this.atPath(payload, config.answerPath) : payload.answer
    const answer = typeof answerValue === 'string' ? answerValue : undefined
    const raw = type === 'CUSTOM' && typeof config.resultPath === 'string' ? this.atPath(payload, config.resultPath)
      : type === 'SERPER' ? (Array.isArray(payload.organic) ? payload.organic : Array.isArray(payload.news) ? payload.news : [])
      : type === 'BRAVE' ? ((payload.web as Record<string, unknown> | undefined)?.results || [])
      : Array.isArray(payload.results) ? payload.results : Array.isArray(payload.data) ? payload.data : []
    const seen = new Set<string>()
    const results = (Array.isArray(raw) ? raw : []).slice(0, maxResults * 2).map<SearchResult>((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const custom = type === 'CUSTOM'
      const title = custom && typeof config.titleField === 'string' ? this.atPath(row, config.titleField) : row.title ?? row.name
      const url = custom && typeof config.urlField === 'string' ? this.atPath(row, config.urlField) : row.url ?? row.link
      const text = custom && typeof config.contentField === 'string' ? this.atPath(row, config.contentField) : row.content ?? row.text ?? row.snippet ?? row.description ?? ((row.contents as Record<string, unknown> | undefined)?.text)
      const published = custom && typeof config.publishedAtField === 'string' ? this.atPath(row, config.publishedAtField) : row.publishedDate ?? row.published_at ?? row.age
      return { title: String(title || url || ''), url: this.normalizeWebUrl(String(url || '')), content: String(text || '').slice(0, 3000), publishedAt: published ? String(published) : undefined, score: typeof row.score === 'number' ? row.score : undefined }
    }).filter((item) => {
      if (!item.url || seen.has(item.url)) return false
      seen.add(item.url)
      return true
    }).slice(0, maxResults)
    return { answer, results }
  }

  private async enrichOutput<T extends { results: SearchResult[] }>(output: T, signal?: AbortSignal): Promise<T> {
    const candidates = output.results.slice(0, MAX_ENRICHED_RESULTS)
    const pages = await Promise.all(candidates.map((item) => this.extractPage(item.url, signal).catch((error) => signal?.aborted ? Promise.reject(error) : null)))
    let remaining = MAX_ENRICHED_TEXT
    const results = output.results.map((item, index) => {
      const page = pages[index]
      if (!page || remaining <= 0) return item
      const content = page.content.slice(0, Math.min(MAX_PAGE_TEXT, remaining))
      remaining -= content.length
      return {
        ...item,
        title: page.title || item.title,
        url: page.url,
        content: content.length >= 160 ? content : item.content,
        publishedAt: page.publishedAt || item.publishedAt,
      }
    })
    return { ...output, results }
  }

  private async extractPage(value: string, signal?: AbortSignal) {
    let url = this.normalizeWebUrl(value)
    if (!url) throw new Error('网页地址无效')
    let response: Response | null = null
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      await this.endpointPolicy.assertPublicHttpUrl(url)
      response = await fetchPublicManualRedirect(url, {
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'OnlyArt-Search/1.0' },
        signal: this.combineSignal(signal, 6_000),
      })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      if (!location || redirect === 3) throw new Error('网页重定向无效')
      url = this.normalizeWebUrl(new URL(location, url).toString())
      if (!url) throw new Error('网页重定向地址无效')
    }
    if (!response?.ok) throw new Error(`网页返回 HTTP ${response?.status || 502}`)
    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) throw new Error('网页不是 HTML 内容')
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (declaredSize > MAX_PAGE_BYTES) throw new Error('网页内容过大')
    const html = await this.readBoundedText(response, MAX_PAGE_BYTES)
    const $ = load(html)
    $('script,style,noscript,template,svg,canvas,iframe,form,nav,footer,aside').remove()
    const title = String($('meta[property="og:title"]').attr('content') || $('title').first().text() || $('h1').first().text()).replace(/\s+/g, ' ').trim().slice(0, 300)
    const publishedAt = String(
      $('meta[property="article:published_time"]').attr('content')
      || $('meta[name="date"]').attr('content')
      || $('meta[name="publishdate"]').attr('content')
      || $('time[datetime]').first().attr('datetime')
      || '',
    ).trim().slice(0, 100) || undefined
    const root = $('main,article,[role="main"],.article,.post,.entry-content,.article-content').filter((_, element) => $(element).text().trim().length >= 200).first()
    const content = (root.length ? root : $('body')).text().replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT)
    return { title, url, content, publishedAt }
  }

  private combineSignal(signal: AbortSignal | undefined, timeoutMs: number) {
    const timeout = AbortSignal.timeout(timeoutMs)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  private async readBoundedText(response: Response, limit: number) {
    if (!response.body) return (await response.text()).slice(0, limit)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let size = 0
    let output = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('网页内容超过大小限制') }
      output += decoder.decode(value, { stream: true })
    }
    return output + decoder.decode()
  }


  private markSuccess(id: string, count: number, message?: string) { return this.prisma.webSearchChannel.updateMany({ where: { id }, data: { totalRequests: { increment: 1 }, consecutiveFailures: 0, cooldownUntil: null, lastSuccessAt: new Date(), lastHealthAt: new Date(), lastHealthStatus: 'healthy', lastHealthMessage: message || `最近调用成功，返回 ${count} 条结果` } }) }
  private async markFailure(id: string, message: string) { const channel = await this.prisma.webSearchChannel.findUnique({ where: { id }, select: { consecutiveFailures: true } }); if (!channel) return; const failures = channel.consecutiveFailures + 1; return this.prisma.webSearchChannel.update({ where: { id }, data: { totalRequests: { increment: 1 }, totalFailures: { increment: 1 }, consecutiveFailures: failures, lastFailureAt: new Date(), lastHealthAt: new Date(), lastHealthStatus: 'unhealthy', lastHealthMessage: message.slice(0, 500), cooldownUntil: new Date(Date.now() + Math.min(300, 15 * 2 ** Math.min(4, failures - 1)) * 1000) } }) }
  private async channelData(input: ChannelInput): Promise<Prisma.WebSearchChannelCreateInput> {
    const apiKey = input.apiKey?.trim() || ''
    const endpoint = (input.endpoint || endpoints[input.type]).trim()
    if (!endpoint) throw new BadRequestException('请填写搜索地址')
    await this.assertSearchEndpoint(endpoint)
    return { name: input.name.trim(), type: input.type, endpoint, encryptedApiKey: apiKey ? this.crypto.encrypt(apiKey) : '', apiKeyHint: apiKey ? this.crypto.hint(apiKey) : '', enabled: input.enabled ?? false, priority: input.priority ?? 0, timeoutMs: input.timeoutMs ?? 30000, maxResults: input.maxResults ?? 8, config: (input.config || {}) as Prisma.InputJsonValue }
  }
  private integration(value: Prisma.JsonValue | null | undefined): 'dailyhot' | 'tgmeng' | undefined {
    const integration = this.record(value).integration
    return integration === 'dailyhot' || integration === 'tgmeng' ? integration : undefined
  }
  private async assertSearchEndpoint(value: string, integration?: 'dailyhot' | 'tgmeng') {
    const normalized = this.normalizeWebUrl(value)
    if (!normalized) throw new BadRequestException('搜索渠道 Endpoint 地址无效')
    if (integration === 'dailyhot' && this.isBuiltInDailyHotEndpoint(normalized)) return new URL(normalized)
    if (integration === 'tgmeng' && normalized === TGMENG_ENDPOINT) return new URL(normalized)
    try { return await this.endpointPolicy.assertPublicHttpUrl(normalized) }
    catch { throw new BadRequestException('搜索渠道 Endpoint 必须是可解析的公网 HTTP/HTTPS 地址') }
  }
  private isBuiltInDailyHotEndpoint(value: string) {
    try {
      const url = new URL(value)
      return url.protocol === 'http:'
        && url.hostname.toLowerCase() === 'dailyhot'
        && (url.port || '6688') === '6688'
        && (url.pathname === '' || url.pathname === '/')
        && !url.username && !url.password && !url.search && !url.hash
    } catch { return false }
  }
  private publicChannel<T extends WebSearchChannel>(row: T) { return { ...row, encryptedApiKey: undefined, hasApiKey: Boolean(row.encryptedApiKey) } }
  private findTgmeng() { return this.prisma.webSearchChannel.findMany({ where: { type: WebSearchProviderType.CUSTOM } }).then((rows) => rows.find((row) => this.isTgmeng(row)) || null) }
  private findDailyHot() { return this.prisma.webSearchChannel.findMany({ where: { type: WebSearchProviderType.CUSTOM } }).then((rows) => rows.find((row) => this.isDailyHot(row)) || null) }
  private isTgmeng(channel: Pick<WebSearchChannel, 'config'>) { return this.record(channel.config).integration === 'tgmeng' }
  private isDailyHot(channel: Pick<WebSearchChannel, 'config'>) { return this.record(channel.config).integration === 'dailyhot' }
  private isSystemRecommendation(channel: Pick<WebSearchChannel, 'config'>) { return this.isTgmeng(channel) || this.isDailyHot(channel) }
  private categories(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && TGMENG_CATEGORIES.includes(item)))].slice(0, TGMENG_CATEGORIES.length) : [] }
  private dailyHotSources(value: unknown) {
    const sourceIds = Array.isArray(value) ? value : DAILY_HOT_DEFAULT_SOURCES
    const selected = [...new Set(sourceIds.filter((item): item is string => typeof item === 'string' && DAILY_HOT_SOURCE_SET.has(item)))].slice(0, 12)
    return selected.length ? selected : [...DAILY_HOT_DEFAULT_SOURCES]
  }
  private recommendationItems(value: unknown): RecommendationItem[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const row = item as Record<string, unknown>
      const title = String(row.title || '').trim()
      if (!title) return []
      return [{ title, prompt: String(row.prompt || title), targetUrl: String(row.targetUrl || ''), source: String(row.source || ''), category: String(row.category || ''), publishedAt: String(row.publishedAt || ''), sourceUrl: String(row.sourceUrl || '') }]
    }).slice(0, 240)
  }
  private record(value: Prisma.JsonValue | null | undefined): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {} }
  private atPath(value: unknown, path: string): unknown {
    return path.split('.').filter(Boolean).reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
  }
  private normalizeWebUrl(value: string) {
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) return ''
      if (url.username || url.password) return ''
      url.hash = ''
      if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = ''
      for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith('utm_') || TRACKING_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key)
      url.searchParams.sort()
      return url.toString()
    } catch { return '' }
  }
  private networkError(reason: unknown) {
    const error = reason instanceof Error ? reason : null
    const cause = error?.cause && typeof error.cause === 'object' ? error.cause as { code?: string; message?: string } : null
    const code = cause?.code || ''
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return '连接超时，请检查部署服务器的 DNS、出口网络或代理设置'
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS 解析失败，请检查部署服务器的 DNS 设置'
    if (code === 'ECONNRESET') return '连接被对方或出口网络重置'
    if (code === 'ECONNREFUSED') return '目标服务器拒绝连接'
    return [cause?.message, error?.message].find((message) => message && message !== 'fetch failed') || '网络请求失败'
  }
}
