import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { ModelCapability, Prisma, ProviderAuthType, ProviderType, SystemSetting } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { localWorkerHttpUrl, PublicEndpointPolicyService } from '../common/public-endpoint-policy.service'
import { CredentialCryptoService } from './credential-crypto.service'
import { normalizeSiteContent } from './site-content'
import { CapabilityRegistryService } from './capability-registry.service'
import { DiscoveredModel, inferModelCapability } from './model-discovery.service'
import { normalizeChatHomeContent } from './chat-home-content'
import { ProviderHealthService } from './provider-health.service'
import { ProviderRoutingService } from './provider-routing.service'
import {
  orderPlatformRoutes,
  orderPrivateRoutes,
  providerSourceRequirement,
  userCredentialCreditCost
} from './provider-routing'
import { modelPricingFields, ProviderPricingService } from './provider-pricing.service'
import { fetchNoRedirect, fetchPublicNoRedirect } from '../common/outbound-http'
import { isGeminiImageModel } from '../generations/image-options'
import { seedanceVideoCapabilities } from '../generations/video-options'
import { AssetsService } from '../assets/assets.service'

type ProviderInput = {
  name: string
  templateId?: string | null
  type: ProviderType
  baseUrl: string
  apiKey?: string
  authType?: ProviderAuthType
  enabled?: boolean
  priority?: number
  weight?: number
  timeoutMs?: number
  allowUserKeys?: boolean
  autoSyncModels?: boolean
  customHeaders?: Record<string, string>
  metadata?: Record<string, unknown>
}

type OnlyCodeProvisioningGroup = {
  name: string
  ratio: number
  models: string[]
  capabilities: ModelCapability[]
}

function routeOptionsRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

type ModelVendorInput = {
  key: string
  name: string
  icon?: string
  websiteUrl?: string
  enabled?: boolean
  sortOrder?: number
}

type ProviderTemplateInput = {
  key: string
  name: string
  description?: string
  vendorId?: string | null
  type: ProviderType
  baseUrl?: string
  authType?: ProviderAuthType
  apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  nativeSearchProvider?: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'doubao' | 'disabled'
  customHeaders?: Record<string, string>
  supportsDiscovery?: boolean
  enabled?: boolean
  sortOrder?: number
}

type CredentialInput = {
  apiKey?: string
  enabled?: boolean
  autoSyncModels?: boolean
  isDefault?: boolean
  priority?: number
  weight?: number
  expiresAt?: string | null
}

const USER_MODEL_SYNC_CATCH_UP_MS = 60 * 60 * 1000
const MODEL_SYNC_TICK_MS = 10 * 60 * 1000
const MODEL_SYNC_TICK_LIMIT = 50
const MODEL_SYNC_CONCURRENCY = 3
const SUPPRESSED_MODEL_LIMIT = 500
/** 自动同步停用预设时写入的标记，用于上游模型重新上线后恢复上架。 */
const UPSTREAM_OFFLINE_BADGE = '上游已下线'
/** 同步间隔小时数，非法值回退到默认值。 */
function syncIntervalMs(hours: number | undefined | null, fallbackHours = 6) {
  const value = Number.isFinite(hours) ? Math.trunc(hours as number) : fallbackHours
  return Math.min(168, Math.max(1, value || fallbackHours)) * 3_600_000
}
/** 只有标准 `/models` 模型清单渠道参与自动同步；Worker 与图片接口不是模型清单。 */
/** 支持蒙版编辑的图片模型家族；其余模型仍可用参考图，但不提供区域编辑入口。 */
const IMAGE_MASK_PATTERN = /gpt-image|dall-?e|[-_]edit\b|inpaint/i
/** 支持参考图/图生图的图片模型家族。 */
const IMAGE_REFERENCE_PATTERN = /gpt-image|dall-?e|grok-imagine-image|seedream|flux|qwen-image|nano-?banana|imagen|edit|inpaint/i
/** 已知支持多档输出尺寸的图片模型家族；其余按单档 1K 处理。 */
const IMAGE_TIERED_PATTERN = /gpt-image|dall-?e|gemini|imagen|seedream|flux|qwen-image|nano-?banana|[-_]edit|inpaint/i
const IMAGE_RESOLUTION_SIZES = [
  // 1K
  '1024x1024', '1280x720', '720x1280', '1536x1024', '1024x1536',
  // 2K
  '2048x2048', '2048x1152', '1152x2048', '2016x1344', '1344x2016',
  // 4K（上游单图上限约 829 万像素）
  '2880x2880', '3840x2160', '2160x3840', '3520x2352', '2352x3520',
]
const AUTO_SYNC_PROVIDER_TYPES: ProviderType[] = [ProviderType.OPENAI, ProviderType.NEW_API, ProviderType.SUB2API, ProviderType.OPENAI_COMPATIBLE]

type UserModelInput = {
  displayName: string
  description?: string
  vendorId?: string
  capability: ModelCapability
  apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  routingStrategy?: 'PRIORITY' | 'WEIGHTED' | 'ROUND_ROBIN'
  enabled?: boolean
  isDefault?: boolean
  options?: Record<string, unknown>
  routes: Array<{ credentialId: string; upstreamModel: string; enabled?: boolean; priority?: number; weight?: number }>
}

type SystemSettingsInput = Partial<{
  siteName: string
  siteLogoUrl: string
  supportUrl: string
  sidebarCreationEnabled: boolean
  sidebarCommerceEnabled: boolean
  sidebarOfficeEnabled: boolean
  sidebarPromptsEnabled: boolean
  sidebarPluginsEnabled: boolean
  sidebarProjectsEnabled: boolean
  sidebarAssetsEnabled: boolean
  registrationEnabled: boolean
  emailLoginEnabled: boolean
  emailVerifyEnabled: boolean
  passwordLoginEnabled: boolean
  passwordRegistrationEnabled: boolean
  linuxDoLoginEnabled: boolean
  linuxDoClientId: string
  linuxDoClientSecret: string
  linuxDoRedirectUrl: string
  linuxDoScopes: string
  linuxDoAuthorizeUrl: string
  linuxDoTokenUrl: string
  linuxDoUserInfoUrl: string
  allowedEmailDomains: string[]
  otpTtlMinutes: number
  otpResendSeconds: number
  defaultUserCredits: number
  defaultTheme: string
  defaultLanguage: string
  chatUiPreset: string
  chatHomeContent: Record<string, unknown>
  siteContent: Record<string, unknown>
  defaultChatModelKey: string
  defaultImageModelKey: string
  imagePromptEnabled: boolean
  imagePromptModelKey: string
  imagePromptBillingMode: string
  userByokEnabled: boolean
  inviteRewardCredits: number
  referralEnabled: boolean
  referralCoolingDays: number
  referralMinimumPaidCents: number
  referralMonthlyRewardLimit: number
  referralAutoApprove: boolean
  rechargeEnabled: boolean
  minRechargeCents: number
  currency: string
  creditValueMicros: number
  pricingUsdExchangeRateMicros: number
  modelImportMarkupPercent: number
  modelPriceCatalogUrl: string
  modelPriceCatalogRefreshHours: number
  modelAutoSyncEnabled: boolean
  modelAutoSyncIntervalHours: number
  channelModelAutoSyncEnabled: boolean
  channelModelAutoSyncIntervalHours: number
  subscriptionsEnabled: boolean
  trialEnabled: boolean
  defaultTrialPlanId: string
  trialCredits: number
  defaultUserGroupId: string
  temporaryChatRetentionHours: number
  mediaRetentionDays: 1 | 7 | 30
  defaultChatHistoryEnabled: boolean
  defaultTrainingOptOut: boolean
  defaultShareUsageAnalytics: boolean
  smtpEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  smtpPassword: string
  smtpFromName: string
  smtpFromEmail: string
  newApiProvisioningGroups: string[]
}>

export type ResolvedProvider = {
  source: 'user' | 'admin' | 'environment'
  providerId?: string
  credentialId?: string
  routeId?: string
  label?: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  authType: ProviderAuthType
  headers: Record<string, string>
  timeoutMs: number
  model: string
  presetKey?: string
  creditCost: number
  settlementCurrency: string
  creditValueMicros: number
  pricingUsdExchangeRateMicros: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  baseInputCreditsPerMillion: number
  baseOutputCreditsPerMillion: number
  imageCapabilities?: Record<string, unknown>
  videoCapabilities?: Record<string, unknown>
  creditRatePercent: number
  apiProtocol: 'openai' | 'anthropic' | 'gemini'
  /** Model/route request hints such as reasoning_effort or enable_thinking. */
  options?: Record<string, unknown>
  nativeSearchProvider?: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'qwen' | 'doubao'
}

type ResolvedPreset = {
  preset: Prisma.ModelPresetGetPayload<{ include: { provider: true; providerRoutes: { include: { provider: true } } } }> | null
  model: string
  creditCost: number
  policy: Awaited<ReturnType<ProvidersService['userPolicy']>>
  settings: SystemSetting | null
}

type VideoCapabilities = {
  resolutions: string[]
  durations: number[]
  aspectRatios: string[]
  maxReferences: number
  maxFirstLastFrames: number
  maxVideoReferences: number
  maxAudioReferences: number
  faceSupported: boolean | null
}

type VideoCapabilityRoute = {
  options: Prisma.JsonValue | null
  provider: { type: ProviderType; enabled: boolean; encryptedApiKey: string }
}

const DEFAULT_PRESETS = [
  { key: 'gpt-5.5', displayName: 'gpt-5.5', upstreamModel: 'gpt-5.5', capability: ModelCapability.CHAT, sortOrder: 10, isDefault: true, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'gpt-5.6-sol', displayName: 'gpt-5.6-sol', upstreamModel: 'gpt-5.6-sol', capability: ModelCapability.CHAT, sortOrder: 20, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'gpt-5.6-terra', displayName: 'gpt-5.6-terra', upstreamModel: 'gpt-5.6-terra', capability: ModelCapability.CHAT, sortOrder: 30, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'gpt-5.6-luna', displayName: 'gpt-5.6-luna', upstreamModel: 'gpt-5.6-luna', capability: ModelCapability.CHAT, sortOrder: 40, flatCreditCost: 0, inputCreditsPerMillion: 260, outputCreditsPerMillion: 1040 },
  { key: 'grok-4.5', displayName: 'grok-4.5', upstreamModel: 'grok-4.5', capability: ModelCapability.CHAT, sortOrder: 50, flatCreditCost: 0, inputCreditsPerMillion: 390, outputCreditsPerMillion: 1300 },
  { key: 'claude-sonnet', displayName: 'Claude Sonnet', upstreamModel: 'claude-sonnet-4-5', capability: ModelCapability.CHAT, sortOrder: 60, flatCreditCost: 0, description: '支持 Anthropic Messages 或 OpenAI Compatible 渠道', inputCreditsPerMillion: 390, outputCreditsPerMillion: 1950 },
  { key: 'gemini-pro', displayName: 'Gemini Pro', upstreamModel: 'gemini-2.5-pro', capability: ModelCapability.CHAT, sortOrder: 70, flatCreditCost: 0, description: '支持 Gemini GenerateContent 或 OpenAI Compatible 渠道', inputCreditsPerMillion: 163, outputCreditsPerMillion: 1300 },
  { key: 'deepseek-chat', displayName: 'DeepSeek', upstreamModel: 'deepseek-chat', capability: ModelCapability.CHAT, sortOrder: 80, flatCreditCost: 0, inputCreditsPerMillion: 36, outputCreditsPerMillion: 143 },
  { key: 'qwen-max', displayName: 'Qwen Max', upstreamModel: 'qwen-max', capability: ModelCapability.CHAT, sortOrder: 90, flatCreditCost: 0, inputCreditsPerMillion: 100, outputCreditsPerMillion: 300 },
  {
    key: 'pollinations-free',
    displayName: 'Pollinations',
    upstreamModel: 'flux',
    capability: ModelCapability.IMAGE,
    sortOrder: 5,
    enabled: false,
    flatCreditCost: 0,
    imageCostMicros: 0,
    description: '可选的无密钥图片生成渠道，启用前请确认服务条款与可用性',
    options: {
      imageCapabilities: {
        sizes: ['1024x1024', '1280x720', '720x1280', '1536x1024', '1024x1536'],
        qualities: ['medium'],
        outputFormats: ['jpeg'],
        backgrounds: ['opaque'],
        maxCount: 1,
        defaultSize: '1024x1024',
        defaultQuality: 'medium',
        supportsReference: false,
        supportsMask: false,
        resolutionPricing: { '1K': 0 },
      },
    },
  },
  { key: 'gpt-image-2', displayName: 'GPT Image 2', upstreamModel: 'gpt-image-2', capability: ModelCapability.IMAGE, sortOrder: 10, isDefault: true },
  { key: 'grok-imagine', displayName: 'Grok Imagine', upstreamModel: 'grok-imagine-image', capability: ModelCapability.IMAGE, sortOrder: 20 },
  { key: 'nano-banana-pro', displayName: 'Nano Banana Pro', upstreamModel: 'nano-banana-pro', capability: ModelCapability.IMAGE, sortOrder: 30 },
  { key: 'flux-pro', displayName: 'FLUX Pro', upstreamModel: 'flux-pro', capability: ModelCapability.IMAGE, sortOrder: 40 },
  { key: 'seedream', displayName: 'Seedream', upstreamModel: 'seedream-4.5', capability: ModelCapability.IMAGE, sortOrder: 50 },
  {
    key: 'sora-2',
    displayName: 'Grok Imagine Video',
    upstreamModel: 'grok-imagine-video',
    capability: ModelCapability.VIDEO,
    sortOrder: 10,
    isDefault: true,
    flatCreditCost: 10,
    description: 'Grok 视频生成',
    options: {
      videoCapabilities: {
        resolutions: ['480p', '720p'],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        defaultResolution: '720p',
        defaultDuration: 5,
        defaultAspectRatio: '16:9',
        pricing: { '480p:5': 5, '480p:10': 10, '720p:5': 10, '720p:10': 20 },
        createPath: '/videos',
        statusPath: '/videos/{id}',
        contentPath: '/videos/{id}/content',
        pollIntervalMs: 3000,
        maxPollSeconds: 600,
      },
    },
  },
]

const DEFAULT_VENDORS = [
  { key: 'openai', name: 'OpenAI', websiteUrl: 'https://openai.com', sortOrder: 10 },
  { key: 'anthropic', name: 'Anthropic', websiteUrl: 'https://anthropic.com', sortOrder: 20 },
  { key: 'google', name: 'Google Gemini', websiteUrl: 'https://ai.google.dev', sortOrder: 30 },
  { key: 'xai', name: 'xAI', websiteUrl: 'https://x.ai', sortOrder: 40 },
  { key: 'deepseek', name: 'DeepSeek', websiteUrl: 'https://deepseek.com', sortOrder: 50 },
  { key: 'qwen', name: 'Qwen', websiteUrl: 'https://bailian.console.aliyun.com', sortOrder: 60 },
  { key: 'doubao', name: 'Doubao', websiteUrl: 'https://www.volcengine.com/product/ark', sortOrder: 70 },
  { key: 'other', name: 'Other', websiteUrl: '', sortOrder: 999 },
] as const

const DEFAULT_PROVIDER_TEMPLATES = [
  { key: 'openai', name: 'OpenAI', vendorKey: 'openai', type: ProviderType.OPENAI, baseUrl: 'https://api.openai.com/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'openai', sortOrder: 10 },
  { key: 'anthropic', name: 'Anthropic', vendorKey: 'anthropic', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://api.anthropic.com/v1', authType: ProviderAuthType.X_API_KEY, apiProtocol: 'anthropic', nativeSearchProvider: 'anthropic', sortOrder: 20 },
  { key: 'gemini', name: 'Google Gemini', vendorKey: 'google', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://generativelanguage.googleapis.com/v1beta', authType: ProviderAuthType.X_API_KEY, apiProtocol: 'gemini', nativeSearchProvider: 'gemini', supportsDiscovery: false, sortOrder: 30 },
  { key: 'xai', name: 'xAI', vendorKey: 'xai', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://api.x.ai/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'xai', sortOrder: 40 },
  { key: 'deepseek', name: 'DeepSeek', vendorKey: 'deepseek', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://api.deepseek.com/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 50 },
  { key: 'qwen', name: '阿里云百炼', vendorKey: 'qwen', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'qwen', sortOrder: 60 },
  { key: 'doubao', name: '火山方舟', vendorKey: 'doubao', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', nativeSearchProvider: 'doubao', supportsDiscovery: false, sortOrder: 70 },
  { key: 'newapi', name: 'NewAPI', vendorKey: 'other', type: ProviderType.NEW_API, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 80 },
  { key: 'sub2api', name: 'Sub2API', vendorKey: 'other', type: ProviderType.SUB2API, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 90 },
  { key: 'openrouter', name: 'OpenRouter', vendorKey: 'other', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: 'https://openrouter.ai/api/v1', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 100 },
  { key: 'litellm', name: 'LiteLLM', vendorKey: 'other', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 110 },
  { key: 'ollama', name: 'Ollama / OpenAI Compatible', vendorKey: 'other', type: ProviderType.OPENAI_COMPATIBLE, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', sortOrder: 120 },
  { key: 'local-worker', name: 'OnlyArt Local Worker', vendorKey: 'other', type: ProviderType.LOCAL_WORKER, baseUrl: '', authType: ProviderAuthType.BEARER, apiProtocol: 'openai', supportsDiscovery: true, sortOrder: 130 },
] as const

@Injectable()
export class ProvidersService implements OnModuleInit {
  private readonly logger = new Logger(ProvidersService.name)
  private modelSyncTimer?: ReturnType<typeof setInterval>
  private readonly modelSyncLocks = new Map<string, Promise<unknown>>()

  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly config: ConfigService, private readonly capabilities: CapabilityRegistryService, private readonly pricing: ProviderPricingService, private readonly health: ProviderHealthService, private readonly routing: ProviderRoutingService, private readonly endpointPolicy: PublicEndpointPolicyService, private readonly assets: AssetsService) {}

  async onModuleInit() {
    await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    for (const vendor of DEFAULT_VENDORS) await this.prisma.modelVendor.upsert({ where: { key: vendor.key }, update: {}, create: vendor })
    const vendors = new Map((await this.prisma.modelVendor.findMany()).map((vendor) => [vendor.key, vendor.id]))
    for (const template of DEFAULT_PROVIDER_TEMPLATES) {
      const { vendorKey, ...data } = template
      await this.prisma.providerTemplate.upsert({ where: { key: data.key }, update: {}, create: { ...data, vendorId: vendors.get(vendorKey) } })
    }
    await this.prisma.modelPreset.createMany({ data: DEFAULT_PRESETS.map((preset) => ({ ...preset, enabled: false, isDefault: false })), skipDuplicates: true })
    await this.prisma.modelPreset.updateMany({ where: { enabled: true, providerId: null, providerRoutes: { none: {} } }, data: { enabled: false, isDefault: false } })
    this.modelSyncTimer = setInterval(() => {
      void this.syncDueModels().catch((error) => {
        this.logger.warn(`上游模型自动同步失败：${error instanceof Error ? error.message : String(error)}`)
      })
    }, MODEL_SYNC_TICK_MS)
    this.modelSyncTimer.unref?.()
  }

  onModuleDestroy() {
    if (this.modelSyncTimer) clearInterval(this.modelSyncTimer)
  }

  normalizeBaseUrl(input: string, type?: ProviderType) {
    let url: URL
    try { url = new URL(input.trim()) } catch { throw new BadRequestException('API 地址格式不正确') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('API 地址只支持 HTTP 或 HTTPS')
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/(chat\/completions|responses|images\/generations|videos(?:\/[^/]+(?:\/content)?)?|models)\/?$/i, '').replace(/\/+$/, '')
    const pollinations = type === ProviderType.POLLINATIONS || url.hostname.toLowerCase().endsWith('pollinations.ai')
    if (pollinations) url.pathname = url.pathname.replace(/\/v1$/i, '') || '/'
    else if (!/\/(?:api\/)?v\d+(?:beta\d*)?$/i.test(url.pathname)) url.pathname = `${url.pathname}/v1`.replace(/\/{2,}/g, '/')
    return url.toString().replace(/\/$/, '')
  }

  private localWorkerAllowedHosts() {
    const configured = this.config.get<string>('LOCAL_WORKER_ALLOWED_HOSTS', '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    // These are the service names shipped by docker-compose.prod.yml. Custom
    // workers must be added explicitly through LOCAL_WORKER_ALLOWED_HOSTS.
    return configured.length ? configured : ['image-worker', 'iopaint-worker', 'realesrgan-worker', 'comfyui-gateway', 'comfyui']
  }

  private async assertProviderEndpoint(input: string, type: ProviderType) {
    const normalized = this.normalizeBaseUrl(input, type)
    if (type === ProviderType.LOCAL_WORKER) {
      localWorkerHttpUrl(normalized, this.localWorkerAllowedHosts())
      return normalized
    }
    await this.endpointPolicy.assertPublicHttpUrl(normalized)
    return normalized
  }

  private async providerEndpointAllowed(input: string, type: ProviderType) {
    try {
      await this.assertProviderEndpoint(input, type)
      return true
    } catch {
      return false
    }
  }

  private providerReady(provider: { type: ProviderType; encryptedApiKey: string }) {
    return provider.type === ProviderType.POLLINATIONS || provider.type === ProviderType.LOCAL_WORKER || Boolean(provider.encryptedApiKey)
  }

  private providerPublished(provider: { type: ProviderType; encryptedApiKey: string; enabled: boolean; lastHealthStatus?: string | null; cooldownUntil?: Date | null } | null | undefined) {
    return Boolean(provider?.enabled
      && this.providerReady(provider)
      && (!provider.cooldownUntil || provider.cooldownUntil.getTime() <= Date.now()))
  }

  private providerHealthy(provider: { type: ProviderType; encryptedApiKey: string; enabled: boolean; lastHealthStatus?: string | null; cooldownUntil?: Date | null } | null | undefined) {
    return Boolean(this.providerPublished(provider) && provider?.lastHealthStatus === 'healthy')
  }

  buildPollinationsImageUrl(baseUrl: string, prompt: string, options: { model: string; width: number; height: number; seed: number }) {
    const url = new URL(this.normalizeBaseUrl(baseUrl, ProviderType.POLLINATIONS))
    const basePath = url.pathname.replace(/\/+$/, '')
    url.pathname = `${basePath}/prompt/${encodeURIComponent(prompt)}`.replace(/\/{2,}/g, '/')
    url.searchParams.set('model', options.model || 'flux')
    url.searchParams.set('width', String(options.width))
    url.searchParams.set('height', String(options.height))
    url.searchParams.set('seed', String(options.seed))
    url.searchParams.set('nologo', 'true')
    url.searchParams.set('enhance', 'false')
    return url
  }

  async assertUserProviderUrl(input: string) {
    const normalized = this.normalizeBaseUrl(input)
    try { await this.endpointPolicy.assertPublicHttpUrl(normalized) } catch { throw new BadRequestException('用户 API 地址必须是可解析的公网 HTTP 或 HTTPS 地址') }
    return normalized
  }

  private headers(value: Prisma.JsonValue | null | undefined) {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {}
    const result: Record<string, string> = {}
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && !['authorization', 'x-api-key', 'x-goog-api-key', 'host'].includes(key.toLowerCase())) result[key] = item
    }
    return result
  }

  private jsonObject(value: Prisma.JsonValue | null | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private videoRouteCapabilities(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const options = value as Record<string, unknown>
    const video = options.videoCapabilities
    return video && typeof video === 'object' && !Array.isArray(video) ? video as Record<string, unknown> : undefined
  }

  private normalizeVideoCapabilities(value: Record<string, unknown> | undefined): VideoCapabilities {
    const resolutions = Array.isArray(value?.resolutions)
      ? value.resolutions.map((item) => String(item).trim().toLowerCase()).filter((item) => {
        if (item === '4k') return true
        const match = /^(\d{3,4})p$/.exec(item)
        return Boolean(match && Number(match[1]) >= 144 && Number(match[1]) <= 4320)
      })
      : []
    const durations = Array.isArray(value?.durations)
      ? value.durations.map(Number).filter((item) => Number.isInteger(item) && ((item >= 1 && item <= 300) || (item === -1 && value.supportsAutoDuration === true)))
      : []
    const aspectRatios = Array.isArray(value?.aspectRatios)
      ? value.aspectRatios.map((item) => String(item).trim()).filter((item) => item === 'adaptive' || /^[1-9]\d?:[1-9]\d?$/.test(item))
      : []
    return {
      resolutions: [...new Set(resolutions)],
      durations: [...new Set(durations)].sort((a, b) => a - b),
      aspectRatios: [...new Set(aspectRatios)],
      maxReferences: value?.maxReferences === undefined ? 1 : Math.max(0, Number(value.maxReferences) || 0),
      maxFirstLastFrames: Math.max(0, Number(value?.maxFirstLastFrames) || 0),
      maxVideoReferences: Math.max(0, Number(value?.maxVideoReferences) || 0),
      maxAudioReferences: Math.max(0, Number(value?.maxAudioReferences) || 0),
      faceSupported: typeof value?.faceSupported === 'boolean' ? value.faceSupported : null,
    }
  }

  private effectiveVideoOptions(
    value: Prisma.JsonValue | null,
    routes: VideoCapabilityRoute[],
    fallbackProvider?: { type: ProviderType; enabled: boolean; encryptedApiKey: string } | null,
  ) {
    const options = value && typeof value === 'object' && !Array.isArray(value)
      ? structuredClone(value) as Record<string, unknown>
      : {}
    const rawGlobal = this.videoRouteCapabilities(options as Prisma.JsonObject)
    if (!rawGlobal) return options
    const global = this.normalizeVideoCapabilities(rawGlobal)
    const activeRoutes = routes.filter((route) => route.provider.enabled && this.providerReady(route.provider))
    const routeCapabilities = activeRoutes.map((route) => {
      const configured = this.videoRouteCapabilities(route.options)
      return configured ? this.normalizeVideoCapabilities(configured) : global
    })
    if (!activeRoutes.length && fallbackProvider?.enabled && this.providerReady(fallbackProvider)) routeCapabilities.push(global)
    if (!routeCapabilities.length) routeCapabilities.push(global)

    const available = routeCapabilities.reduce<VideoCapabilities>((union, route) => ({
      resolutions: [...new Set([...union.resolutions, ...route.resolutions])],
      durations: [...new Set([...union.durations, ...route.durations])].sort((a, b) => a - b),
      aspectRatios: [...new Set([...union.aspectRatios, ...route.aspectRatios])],
      maxReferences: Math.max(union.maxReferences, route.maxReferences),
      maxFirstLastFrames: Math.max(union.maxFirstLastFrames, route.maxFirstLastFrames),
      maxVideoReferences: Math.max(union.maxVideoReferences, route.maxVideoReferences),
      maxAudioReferences: Math.max(union.maxAudioReferences, route.maxAudioReferences),
      faceSupported: union.faceSupported === true || route.faceSupported === true ? true : union.faceSupported === false || route.faceSupported === false ? false : null,
    }), { resolutions: [], durations: [], aspectRatios: [], maxReferences: 0, maxFirstLastFrames: 0, maxVideoReferences: 0, maxAudioReferences: 0, faceSupported: null })
    const intersect = <T extends string | number>(configured: T[], supported: T[]) => configured.length
      ? configured.filter((item) => supported.includes(item))
      : supported
    const resolutions = intersect(global.resolutions, available.resolutions)
    const durations = intersect(global.durations, available.durations)
    const aspectRatios = intersect(global.aspectRatios, available.aspectRatios)
    const pricing = rawGlobal.pricing && typeof rawGlobal.pricing === 'object' && !Array.isArray(rawGlobal.pricing)
      ? Object.fromEntries(Object.entries(rawGlobal.pricing).filter(([key]) => {
        const [resolution, duration] = key.split(':')
        return resolutions.includes(resolution) && durations.includes(Number(duration))
      }))
      : rawGlobal.pricing
    options.videoCapabilities = {
      ...rawGlobal,
      resolutions,
      durations,
      aspectRatios,
      defaultResolution: resolutions.includes(String(rawGlobal.defaultResolution || '').toLowerCase()) ? String(rawGlobal.defaultResolution).toLowerCase() : resolutions[0],
      defaultDuration: durations.includes(Number(rawGlobal.defaultDuration)) ? Number(rawGlobal.defaultDuration) : durations[0],
      defaultAspectRatio: aspectRatios.includes(String(rawGlobal.defaultAspectRatio || '')) ? String(rawGlobal.defaultAspectRatio) : aspectRatios[0],
      maxReferences: available.maxReferences,
      maxFirstLastFrames: available.maxFirstLastFrames,
      maxVideoReferences: available.maxVideoReferences,
      maxAudioReferences: available.maxAudioReferences,
      faceSupported: available.faceSupported,
      pricing,
    }
    return options
  }

  private normalizeRouteOptions(value: Record<string, unknown> | null | undefined, capability: ModelCapability, enabled: boolean, index: number) {
    if (capability !== ModelCapability.VIDEO) return value || undefined
    const options = value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) : {}
    const normalized = this.normalizeVideoCapabilities(this.videoRouteCapabilities(options as Prisma.JsonObject))
    if (enabled && (!normalized.resolutions.length || !normalized.durations.length || !normalized.aspectRatios.length)) {
      throw new BadRequestException(`第 ${index + 1} 个视频渠道必须完整配置分辨率、时长和画面比例`)
    }
    return { ...options, videoCapabilities: { ...this.videoRouteCapabilities(options as Prisma.JsonObject), ...normalized } }
  }

  private routeSupportsVideo(value: Prisma.JsonValue | null | undefined, requirements: Record<string, unknown>) {
    const capabilities = this.videoRouteCapabilities(value)
    if (!capabilities) return true
    const supports = (key: 'resolutions' | 'durations' | 'aspectRatios', requested: unknown, normalize: (item: unknown) => string | number) => {
      if (requested === undefined || requested === null || requested === '') return true
      const configured = Array.isArray(capabilities[key]) ? capabilities[key].map(normalize) : []
      return !configured.length || configured.includes(normalize(requested))
    }
    return supports('resolutions', requirements.resolution, (item) => String(item).trim().toLowerCase())
      && (requirements.duration === -1 && capabilities.supportsAutoDuration === true
        || Number(requirements.duration) >= Number(capabilities.minDuration) && Number(requirements.duration) <= Number(capabilities.maxDuration)
        || supports('durations', requirements.duration, Number))
      && supports('aspectRatios', requirements.aspectRatio, (item) => String(item).trim())
      && Number(requirements.referenceCount || 0) <= Number(capabilities.maxReferences ?? Number.MAX_SAFE_INTEGER)
      && Number(requirements.firstLastFrames || 0) <= Number(capabilities.maxFirstLastFrames ?? Number.MAX_SAFE_INTEGER)
      && Number(requirements.referenceVideoCount || 0) <= Number(capabilities.maxVideoReferences ?? Number.MAX_SAFE_INTEGER)
      && Number(requirements.referenceAudioCount || 0) <= Number(capabilities.maxAudioReferences ?? Number.MAX_SAFE_INTEGER)
      && (requirements.faceRequired !== true || capabilities.faceSupported === true)
  }

  private routeVideoCapabilities(value: Prisma.JsonValue | null | undefined, fallback: Record<string, unknown> | undefined) {
    const override = this.videoRouteCapabilities(value)
    return override ? { ...(fallback || {}), ...override } : fallback
  }

  private nativeSearchProvider(baseUrl: string, apiProtocol: ResolvedProvider['apiProtocol'], ...settings: unknown[]): ResolvedProvider['nativeSearchProvider'] {
    for (const setting of settings) {
      if (!setting || typeof setting !== 'object' || Array.isArray(setting)) continue
      const configured = String((setting as Record<string, unknown>).nativeSearchProvider || '').trim().toLowerCase()
      if (['openai', 'anthropic', 'gemini', 'xai', 'qwen', 'doubao'].includes(configured)) return configured as ResolvedProvider['nativeSearchProvider']
      if (configured === 'none' || configured === 'disabled') return undefined
    }
    const host = (() => { try { return new URL(baseUrl).hostname.toLowerCase() } catch { return '' } })()
    if (apiProtocol === 'anthropic' || host.endsWith('anthropic.com')) return 'anthropic'
    if (apiProtocol === 'gemini' || host.includes('generativelanguage.googleapis.com')) return 'gemini'
    if (host.endsWith('api.openai.com')) return 'openai'
    if (host.endsWith('api.x.ai')) return 'xai'
    if (host.includes('dashscope.aliyuncs.com')) return 'qwen'
    if (host.includes('volces.com')) return 'doubao'
    return undefined
  }

  private async attachNewApiVideoCapabilities(baseUrl: string, headers: Record<string, string>, candidates: DiscoveredModel[]) {
    const url = new URL(baseUrl)
    url.pathname = '/api/pricing'
    url.search = ''
    const response = await fetchPublicNoRedirect(url, { headers, signal: AbortSignal.timeout(30_000) })
    const raw = await response.text()
    if (!response.ok) throw new Error(`NewAPI 能力目录返回 HTTP ${response.status}: ${raw.slice(0, 300)}`)
    const payload = JSON.parse(raw) as { data?: Array<Record<string, unknown>> }
    const configured = new Map<string, Record<string, unknown>>()
    for (const item of payload.data || []) {
      const modelName = String(item.model_name || '').trim()
      const channels = Array.isArray(item.channel_video_capabilities) ? item.channel_video_capabilities : []
      if (!modelName || !channels.length) continue
      let faceSupported: boolean | null = null
      const aggregate = { maxReferences: 0, maxFirstLastFrames: 0, maxVideoReferences: 0, maxAudioReferences: 0 }
      for (const entry of channels) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
        const capabilities = (entry as Record<string, unknown>).capabilities
        if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) continue
        const row = capabilities as Record<string, unknown>
        aggregate.maxReferences = Math.max(aggregate.maxReferences, Math.max(0, Number(row.reference_images) || 0))
        aggregate.maxFirstLastFrames = Math.max(aggregate.maxFirstLastFrames, Math.max(0, Number(row.first_last_frames) || 0))
        aggregate.maxVideoReferences = Math.max(aggregate.maxVideoReferences, Math.max(0, Number(row.reference_videos) || 0))
        aggregate.maxAudioReferences = Math.max(aggregate.maxAudioReferences, Math.max(0, Number(row.reference_audios) || 0))
        if (row.face_supported === true) faceSupported = true
        else if (row.face_supported === false && faceSupported === null) faceSupported = false
      }
      configured.set(modelName.toLowerCase(), { ...aggregate, faceSupported })
    }
    for (const candidate of candidates) {
      const capabilities = configured.get(candidate.id.toLowerCase())
      if (capabilities) candidate.raw = { ...candidate.raw, videoCapabilities: capabilities }
    }
  }

  publicProvider<T extends { encryptedApiKey: string }>(provider: T) {
    const { encryptedApiKey, ...safe } = provider
    return { ...safe, hasApiKey: Boolean(encryptedApiKey) }
  }

  publicCredential<T extends { encryptedApiKey: string }>(credential: T) {
    const { encryptedApiKey, ...safe } = credential
    const output = { ...safe } as Record<string, unknown>
    if (typeof output.inputTokens === 'bigint') output.inputTokens = output.inputTokens.toString()
    if (typeof output.outputTokens === 'bigint') output.outputTokens = output.outputTokens.toString()
    return { ...output, hasApiKey: Boolean(encryptedApiKey) }
  }

  listModelVendors(includeDisabled = false) {
    return this.prisma.modelVendor.findMany({ where: includeDisabled ? {} : { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  }

  listProviderTemplates(includeDisabled = false) {
    return this.prisma.providerTemplate.findMany({ where: includeDisabled ? {} : { enabled: true, type: { notIn: [ProviderType.POLLINATIONS, ProviderType.LOCAL_WORKER] } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { vendor: true, _count: { select: { providerChannels: true, userCredentials: true } } } })
  }

  async createModelVendor(input: ModelVendorInput) {
    return this.prisma.modelVendor.create({ data: {
      key: input.key.trim().toLowerCase(), name: input.name.trim(), icon: input.icon?.trim() || '', websiteUrl: input.websiteUrl?.trim() || '', enabled: input.enabled ?? true, sortOrder: input.sortOrder ?? 0,
    } })
  }

  async updateModelVendor(id: string, input: Partial<ModelVendorInput>) {
    const existing = await this.prisma.modelVendor.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型厂商不存在')
    return this.prisma.modelVendor.update({ where: { id }, data: {
      ...(input.key !== undefined ? { key: input.key.trim().toLowerCase() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.icon !== undefined ? { icon: input.icon.trim() } : {}),
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl.trim() } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    } })
  }

  async deleteModelVendor(id: string) {
    const vendor = await this.prisma.modelVendor.findUnique({ where: { id }, include: { _count: { select: { providerTemplates: true, modelPresets: true, userModels: true } } } })
    if (!vendor) throw new NotFoundException('模型厂商不存在')
    const references = vendor._count.providerTemplates + vendor._count.modelPresets + vendor._count.userModels
    if (references) throw new BadRequestException(`该厂商仍被 ${references} 项配置引用，请先迁移引用`)
    await this.prisma.modelVendor.delete({ where: { id } })
    return { success: true }
  }

  private async assertTemplateVendor(vendorId?: string | null) {
    if (!vendorId) return
    if (!await this.prisma.modelVendor.count({ where: { id: vendorId } })) throw new BadRequestException('模型厂商不存在')
  }

  async createProviderTemplate(input: ProviderTemplateInput) {
    await this.assertTemplateVendor(input.vendorId)
    return this.prisma.providerTemplate.create({ data: {
      key: input.key.trim().toLowerCase(), name: input.name.trim(), description: input.description?.trim() || '', vendorId: input.vendorId || null, type: input.type, baseUrl: input.baseUrl?.trim() || '', authType: input.authType ?? ProviderAuthType.BEARER, apiProtocol: input.apiProtocol ?? 'openai', nativeSearchProvider: input.nativeSearchProvider ?? 'disabled', customHeaders: input.customHeaders as Prisma.InputJsonValue, supportsDiscovery: input.supportsDiscovery ?? true, enabled: input.enabled ?? true, sortOrder: input.sortOrder ?? 0,
    }, include: { vendor: true, _count: { select: { providerChannels: true, userCredentials: true } } } })
  }

  async updateProviderTemplate(id: string, input: Partial<ProviderTemplateInput>) {
    if (!await this.prisma.providerTemplate.count({ where: { id } })) throw new NotFoundException('渠道模板不存在')
    if (input.vendorId !== undefined) await this.assertTemplateVendor(input.vendorId)
    return this.prisma.providerTemplate.update({ where: { id }, data: {
      ...(input.key !== undefined ? { key: input.key.trim().toLowerCase() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId || null } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.trim() } : {}),
      ...(input.authType !== undefined ? { authType: input.authType } : {}),
      ...(input.apiProtocol !== undefined ? { apiProtocol: input.apiProtocol } : {}),
      ...(input.nativeSearchProvider !== undefined ? { nativeSearchProvider: input.nativeSearchProvider } : {}),
      ...(input.customHeaders !== undefined ? { customHeaders: input.customHeaders as Prisma.InputJsonValue } : {}),
      ...(input.supportsDiscovery !== undefined ? { supportsDiscovery: input.supportsDiscovery } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    }, include: { vendor: true, _count: { select: { providerChannels: true, userCredentials: true } } } })
  }

  async deleteProviderTemplate(id: string) {
    const template = await this.prisma.providerTemplate.findUnique({ where: { id }, include: { _count: { select: { providerChannels: true, userCredentials: true } } } })
    if (!template) throw new NotFoundException('渠道模板不存在')
    const references = template._count.providerChannels + template._count.userCredentials
    if (references) throw new BadRequestException(`该模板仍被 ${references} 个渠道或用户密钥引用，请先迁移引用`)
    await this.prisma.providerTemplate.delete({ where: { id } })
    return { success: true }
  }

  listProviders() {
    return this.prisma.providerChannel.findMany({ orderBy: [{ enabled: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }], include: { template: { select: { id: true, name: true, apiProtocol: true, nativeSearchProvider: true } }, _count: { select: { modelPresets: true, modelRoutes: true } } } }).then((rows) => rows.map((row) => this.publicProvider(row)))
  }

  async createProvider(input: ProviderInput) {
    const template = input.templateId ? await this.prisma.providerTemplate.findUnique({ where: { id: input.templateId } }) : null
    if (input.templateId && !template) throw new BadRequestException('渠道模板不存在')
    const metadata = { ...(template ? { apiProtocol: template.apiProtocol, nativeSearchProvider: template.nativeSearchProvider } : {}), ...(input.metadata || {}) }
    const providerType = template?.type ?? input.type
    const baseUrl = await this.assertProviderEndpoint(input.baseUrl || template?.baseUrl || '', providerType)
    const row = await this.prisma.providerChannel.create({ data: {
      name: input.name.trim(), templateId: input.templateId || null, type: providerType, baseUrl, encryptedApiKey: this.crypto.encrypt(input.apiKey || ''), apiKeyHint: this.crypto.hint(input.apiKey || ''), authType: template?.authType ?? input.authType, enabled: input.enabled, priority: input.priority, weight: input.weight, timeoutMs: input.timeoutMs, allowUserKeys: providerType !== ProviderType.POLLINATIONS && providerType !== ProviderType.LOCAL_WORKER && input.allowUserKeys, autoSyncModels: AUTO_SYNC_PROVIDER_TYPES.includes(providerType) && input.autoSyncModels !== false, customHeaders: (input.customHeaders ?? template?.customHeaders) as Prisma.InputJsonValue, metadata: metadata as Prisma.InputJsonValue,
    } })
    return this.publicProvider(row)
  }

  async updateProvider(id: string, input: Partial<ProviderInput>) {
    const existing = await this.prisma.providerChannel.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('上游渠道不存在')
    const template = input.templateId ? await this.prisma.providerTemplate.findUnique({ where: { id: input.templateId } }) : null
    if (input.templateId && !template) throw new BadRequestException('渠道模板不存在')
    const nextType = template?.type ?? input.type ?? existing.type
    const existingMetadata = this.jsonObject(existing.metadata)
    const metadata = input.templateId !== undefined
      ? { ...existingMetadata, ...(template ? { apiProtocol: template.apiProtocol, nativeSearchProvider: template.nativeSearchProvider } : {}), ...(input.metadata || {}) }
      : input.metadata
    const endpointChanged = input.baseUrl !== undefined || input.type !== undefined || (template && template.type !== existing.type)
    const baseUrl = endpointChanged
      ? await this.assertProviderEndpoint(input.baseUrl ?? existing.baseUrl, nextType)
      : existing.baseUrl
    const row = await this.prisma.providerChannel.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId || null } : {}),
      ...(input.type !== undefined || template ? { type: nextType } : {}),
      ...(endpointChanged ? { baseUrl } : {}),
      // A URL change must not silently reuse a credential against a new
      // destination. Require an explicit key rotation for the new endpoint.
      ...(endpointChanged && !input.apiKey ? { encryptedApiKey: '', apiKeyHint: '', lastHealthStatus: null, lastHealthMessage: '渠道地址已变更，请重新配置 API 密钥', cooldownUntil: null } : {}),
      ...(input.apiKey ? { encryptedApiKey: this.crypto.encrypt(input.apiKey), apiKeyHint: this.crypto.hint(input.apiKey), lastRotatedAt: new Date(), lastHealthStatus: null, lastHealthMessage: '密钥已轮换，等待重新检测', cooldownUntil: null } : {}),
      ...(input.apiKey === '' ? { encryptedApiKey: '', apiKeyHint: '' } : {}),
      ...(input.authType !== undefined || template ? { authType: template?.authType ?? input.authType } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(nextType === ProviderType.POLLINATIONS || nextType === ProviderType.LOCAL_WORKER ? { allowUserKeys: false } : input.allowUserKeys !== undefined ? { allowUserKeys: input.allowUserKeys } : {}),
      ...(input.autoSyncModels !== undefined ? { autoSyncModels: AUTO_SYNC_PROVIDER_TYPES.includes(nextType) && input.autoSyncModels } : {}),
      ...(input.customHeaders !== undefined || template ? { customHeaders: (input.customHeaders ?? template?.customHeaders) as Prisma.InputJsonValue } : {}),
      ...(metadata !== undefined ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    } })
    return this.publicProvider(row)
  }

  async deleteProvider(id: string) {
    await this.prisma.providerChannel.delete({ where: { id } }).catch(() => { throw new NotFoundException('上游渠道不存在') })
    return { success: true }
  }

  private applyAuth(headers: Record<string, string>, authType: ProviderAuthType, apiKey: string) {
    if (!apiKey) return headers
    if (authType === ProviderAuthType.BEARER || authType === ProviderAuthType.BOTH) headers.Authorization = `Bearer ${apiKey}`
    if (authType === ProviderAuthType.X_API_KEY || authType === ProviderAuthType.BOTH) headers['x-api-key'] = apiKey
    return headers
  }

  private hasSupportedImageSignature(bytes: Uint8Array) {
    const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString('ascii')
    return (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG')
      || (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8)
      || (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
      || (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6)))
  }

  async fetchRemoteModels(id: string) {
    const provider = await this.prisma.providerChannel.findUnique({ where: { id } })
    if (!provider) throw new NotFoundException('上游渠道不存在')
    const apiKey = this.crypto.decrypt(provider.encryptedApiKey)
    if (!apiKey && provider.type !== ProviderType.POLLINATIONS && provider.type !== ProviderType.LOCAL_WORKER) throw new BadRequestException('请先配置渠道 API 密钥')
    const startedAt = Date.now()
    try {
      const baseUrl = await this.assertProviderEndpoint(provider.baseUrl, provider.type)
      if (provider.type === ProviderType.POLLINATIONS) {
        const url = this.buildPollinationsImageUrl(baseUrl, 'minimal blue circle on white background', { model: 'flux', width: 64, height: 64, seed: 1 })
        const response = await fetchPublicNoRedirect(url, { headers: this.headers(provider.customHeaders), signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
        const declaredSize = Number(response.headers.get('content-length') || 0)
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
        if (!contentType.startsWith('image/')) throw new Error(`渠道返回了非图片内容：${contentType || '未知类型'}`)
        if (declaredSize > 5 * 1024 * 1024) throw new Error('渠道健康检查返回的图片超过 5 MB')
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.length < 64 || bytes.length > 5 * 1024 * 1024 || !this.hasSupportedImageSignature(bytes)) throw new Error('渠道返回的图片数据无效')
        const models = ['flux']
        await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `图片接口正常，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
        const candidates = await this.describeDiscoveredModels(models)
        return { models, candidates: await this.adminDiscoveryStatus(id, candidates), latencyMs: Date.now() - startedAt }
      }
      if (provider.type === ProviderType.LOCAL_WORKER) {
        const headers = this.applyAuth(this.headers(provider.customHeaders), provider.authType, apiKey)
        const health = await fetchNoRedirect(`${baseUrl}/health`, { headers, signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
        if (!health.ok) throw new Error(`Worker 健康检查返回 HTTP ${health.status}: ${(await health.text()).slice(0, 300)}`)
        const response = await fetchNoRedirect(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
        const raw = await response.text()
        if (!response.ok) throw new Error(`Worker 模型目录返回 HTTP ${response.status}: ${raw.slice(0, 300)}`)
        const parsed = JSON.parse(raw) as { data?: Array<string | { id?: string }>; models?: Array<string | { id?: string; name?: string }> }
        const source: Array<string | { id?: string; name?: string }> = parsed.data || parsed.models || []
        const models = [...new Set(source.map((item) => typeof item === 'string' ? item : item.id || item.name).filter((item): item is string => Boolean(item)))].sort()
        if (!models.length) throw new Error('Worker 未发布任何可用能力')
        await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `Worker 正常，发现 ${models.length} 个能力，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
        const candidates = await this.describeDiscoveredModels(parsed)
        return { models, candidates: await this.adminDiscoveryStatus(id, candidates), latencyMs: Date.now() - startedAt }
      }
      const requestHeaders = this.applyAuth(this.headers(provider.customHeaders), provider.authType, apiKey)
      const response = await fetchPublicNoRedirect(`${baseUrl}/models`, { headers: requestHeaders, signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 30_000)) })
      const raw = await response.text()
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 300)}`)
      const parsed = JSON.parse(raw) as unknown
      const candidates = await this.describeDiscoveredModels(parsed)
      if (provider.type === ProviderType.NEW_API) await this.attachNewApiVideoCapabilities(baseUrl, requestHeaders, candidates)
      const models = candidates.map((item) => item.id)
      if (!models.length) throw new Error('渠道未返回可识别的模型列表')
      await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `发现 ${models.length} 个模型，${Date.now() - startedAt}ms`, lastHealthAt: new Date() } })
      return { models, candidates: await this.adminDiscoveryStatus(id, candidates), latencyMs: Date.now() - startedAt }
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败'
      await this.prisma.providerChannel.update({ where: { id }, data: { lastHealthStatus: 'unhealthy', lastHealthMessage: message, lastHealthAt: new Date() } })
      throw new BadRequestException(message)
    }
  }

  private async describeDiscoveredModels(payload: unknown, markupPercent?: number, forceRefresh = false) {
    return this.pricing.discover(payload, markupPercent, forceRefresh)
  }

  async modelPricingComparison(markupPercent?: number, forceRefresh = true) {
    return this.pricing.comparison(markupPercent, forceRefresh)
  }

  async applyModelPricing(input: { modelIds: string[]; markupPercent?: number }) {
    return this.pricing.apply(input, (id, update) => this.updateModel(id, update))
  }

  private async adminDiscoveryStatus(providerId: string, candidates: DiscoveredModel[]) {
    const ids = candidates.map((item) => item.id)
    const existing = await this.prisma.modelPreset.findMany({
      where: { OR: [{ upstreamModel: { in: ids } }, { providerRoutes: { some: { providerId, upstreamModelOverride: { in: ids } } } }] },
      select: { id: true, key: true, upstreamModel: true, providerRoutes: { where: { providerId }, select: { upstreamModelOverride: true } } },
    })
    const status = new Map<string, { id: string; key: string }>()
    for (const model of existing) {
      status.set(model.upstreamModel, { id: model.id, key: model.key })
      for (const route of model.providerRoutes) if (route.upstreamModelOverride) status.set(route.upstreamModelOverride, { id: model.id, key: model.key })
    }
    return candidates.map((candidate) => ({ ...candidate, existingPreset: status.get(candidate.id) || null }))
  }

  private importedModelKey(modelId: string) {
    return modelId.toLowerCase().replace(/^models\//, '').replace(/[^a-z0-9._:-]+/g, '-').replace(/^-|-$/g, '').slice(0, 96) || `model-${Date.now().toString(36)}`
  }

  private discoveredModelOptions(candidate: DiscoveredModel, apiProtocol = 'openai') {
    const discovery = { source: candidate.pricingSource, confidence: candidate.confidence, contextWindow: candidate.contextWindow, maxOutputTokens: candidate.maxOutputTokens, features: candidate.features, importedAt: new Date().toISOString() }
    if (candidate.capability === ModelCapability.IMAGE) {
      const creditCost = Math.max(1, candidate.flatCreditCost || 1)
      const tiered = IMAGE_TIERED_PATTERN.test(candidate.id)
      return {
        apiProtocol,
        discovery,
        imageCapabilities: {
          // 多档家族开放 1K/2K/4K 尺寸；分档定价与服务端 imageResolutionTier 的分档保持一致。
          sizes: tiered ? IMAGE_RESOLUTION_SIZES : ['1024x1024'],
          qualities: ['medium'],
          outputFormats: ['png'],
          backgrounds: ['opaque'],
          maxCount: 1,
          defaultSize: '1024x1024',
          defaultQuality: 'medium',
          // Gemini 图片接口使用原生参考图，不接收蒙版参数。
          supportsReference: apiProtocol === 'gemini' || IMAGE_REFERENCE_PATTERN.test(candidate.id),
          supportsMask: apiProtocol !== 'gemini' && IMAGE_MASK_PATTERN.test(candidate.id),
          resolutionPricing: tiered
            ? { '1K': creditCost, '2K': creditCost * 2, '4K': creditCost * 4 }
            : { '1K': creditCost },
        },
      }
    }
    if (candidate.capability === ModelCapability.VIDEO) {
      const discoveredCapabilities = candidate.raw && candidate.raw.videoCapabilities && typeof candidate.raw.videoCapabilities === 'object' && !Array.isArray(candidate.raw.videoCapabilities)
        ? candidate.raw.videoCapabilities as Record<string, unknown>
        : {}
      const channelLimit = (key: string, nativeLimit: number) => discoveredCapabilities[key] === undefined
        ? nativeLimit
        : Math.min(nativeLimit, Math.max(0, Number(discoveredCapabilities[key]) || 0))
      const seedance = seedanceVideoCapabilities(candidate.id)
      if (seedance) return { apiProtocol, discovery, videoCapabilities: {
        ...seedance,
        maxReferences: channelLimit('maxReferences', seedance.maxReferences),
        maxFirstLastFrames: channelLimit('maxFirstLastFrames', seedance.maxFirstLastFrames),
        maxVideoReferences: channelLimit('maxVideoReferences', seedance.maxVideoReferences),
        maxAudioReferences: channelLimit('maxAudioReferences', seedance.maxAudioReferences),
        faceSupported: typeof discoveredCapabilities.faceSupported === 'boolean' ? discoveredCapabilities.faceSupported : seedance.faceSupported,
      } }
      const perSecond = Math.max(1, candidate.flatCreditCost || 1)
      const h3 = /minimax[-_ ]?h3/i.test(candidate.id)
      const resolution = h3 ? '768p' : candidate.id.match(/(2k|\d{3,4}p)(?:-|$)/i)?.[1].toLowerCase() || '720p'
      const durations = h3 ? [1, 5, 10, 15] : [5, 10]
      return {
        apiProtocol,
        discovery,
        videoCapabilities: {
          resolutions: [resolution],
          durations,
          aspectRatios: h3 ? ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] : ['16:9', '9:16', '1:1'],
          defaultResolution: resolution,
          defaultDuration: 5,
          defaultAspectRatio: '16:9',
          pricing: Object.fromEntries(durations.map((seconds) => [`${resolution}:${seconds}`, perSecond * seconds])),
          createPath: '/videos',
          statusPath: '/videos/{id}',
          contentPath: '/videos/{id}/content',
          pollIntervalMs: 3000,
          maxPollSeconds: 0,
          ...(h3 ? {
            maxReferences: channelLimit('maxReferences', 9),
            maxFirstLastFrames: channelLimit('maxFirstLastFrames', 2),
            maxVideoReferences: channelLimit('maxVideoReferences', 3),
            maxAudioReferences: channelLimit('maxAudioReferences', 3),
            maxTotalReferences: 12,
            faceSupported: typeof discoveredCapabilities.faceSupported === 'boolean' ? discoveredCapabilities.faceSupported : null,
            referenceMode: 'CONTENT_JSON' as const,
            minDuration: 1,
            maxDuration: 15,
            resolutionLocked: true,
            requiresPublicReferenceUrls: true,
            audioRequiresVisualReference: false,
          } : {}),
        },
      }
    }
    return { apiProtocol, discovery, agentEnabled: candidate.agentCapabilities?.eligible !== false, agentCapabilities: candidate.agentCapabilities }
  }

  async agentModelProfile(userId: string, requestedModel: string) {
    const normalized = requestedModel.trim()
    const models = await this.listModelsForUser(userId, ModelCapability.CHAT)
    const model = models.find((item) => item.key === normalized || item.displayName === normalized || item.upstreamModel === normalized)
    if (!model) throw new BadRequestException('当前账户不能使用这个 Agent 模型，请重新选择')
    const options = model.options && typeof model.options === 'object' && !Array.isArray(model.options) ? model.options as Record<string, unknown> : {}
    const capabilities = options.agentCapabilities && typeof options.agentCapabilities === 'object' && !Array.isArray(options.agentCapabilities)
      ? options.agentCapabilities as Record<string, unknown>
      : {}
    const discovery = options.discovery && typeof options.discovery === 'object' && !Array.isArray(options.discovery)
      ? options.discovery as Record<string, unknown>
      : {}
    const contextWindow = Number(capabilities.contextWindow ?? discovery.contextWindow ?? 0) || null
    const explicitlyEnabled = options.agentEnabled
    const eligible = explicitlyEnabled !== false && (explicitlyEnabled === true || !contextWindow || contextWindow >= 8192) && capabilities.eligible !== false
    const reason = String(capabilities.reason || (eligible ? '可用于 OnlyArt Agent 服务端编排' : '模型已被管理员停用 Agent 能力'))
    if (!eligible) throw new BadRequestException(`模型“${model.displayName}”不适合 Agent 任务：${reason}`)
    return {
      key: model.key,
      displayName: model.displayName,
      source: model.source,
      contextWindow,
      maxOutputTokens: Number(capabilities.maxOutputTokens ?? discovery.maxOutputTokens ?? 0) || null,
      supportsTools: capabilities.supportsTools === true,
      supportsStructuredOutput: capabilities.supportsStructuredOutput === true,
      supportsReasoning: capabilities.supportsReasoning === true,
      reason,
    }
  }

  async importProviderModels(providerId: string, input: { modelIds?: string[]; importAll?: boolean; markupPercent?: number; overwritePricing?: boolean }) {
    const provider = await this.prisma.providerChannel.findUnique({ where: { id: providerId }, include: { template: true } })
    if (!provider) throw new NotFoundException('上游渠道不存在')
    const discovered = await this.fetchRemoteModels(providerId)
    const selected = new Set((input.importAll ? discovered.candidates.filter((item) => item.importable).map((item) => item.id) : input.modelIds || []).map((item) => item.trim()))
    if (!selected.size) throw new BadRequestException('请选择需要导入的模型')
    const candidates = input.markupPercent === undefined
      ? discovered.candidates
      : (await this.describeDiscoveredModels(discovered.candidates.map((item) => ({ id: item.id })), input.markupPercent)).map((candidate) => ({
        ...candidate,
        raw: { ...candidate.raw, ...discovered.candidates.find((item) => item.id === candidate.id)?.raw },
      }))
    const importable = candidates.filter((item) => selected.has(item.id) && item.importable && item.capability)
    if (!importable.length) throw new BadRequestException('选择的模型不属于当前可导入能力')
    const result = await this.applyProviderImport(provider, importable, { overwritePricing: input.overwritePricing })
    await this.prisma.providerChannel.update({ where: { id: providerId }, data: { lastModelSyncAt: new Date() } })
    return { discovered: discovered.models.length, availableModels: discovered.models, selected: selected.size, imported: result.length, models: result }
  }

  /** 上游模型自动同步：新增上游新模型，并清理已下线的路由与预设。 */
  async syncProviderModels(providerId: string) {
    return this.withModelSyncLock(`provider:${providerId}`, async () => {
      const provider = await this.prisma.providerChannel.findUnique({ where: { id: providerId }, include: { template: true } })
      if (!provider) throw new NotFoundException('上游渠道不存在')
      let discovered: Awaited<ReturnType<ProvidersService['fetchRemoteModels']>>
      try {
        discovered = await this.fetchRemoteModels(providerId)
      } catch (error) {
        await this.prisma.providerChannel.update({ where: { id: providerId }, data: { lastModelSyncAt: new Date() } })
        throw error
      }
      const importable = discovered.candidates.filter((item) => item.importable && item.capability)
      const result = await this.applyProviderImport(provider, importable, { overwritePricing: false })
      const removed = await this.pruneProviderModels(providerId, new Set(importable.map((item) => item.id)))
      await this.prisma.providerChannel.update({ where: { id: providerId }, data: { lastModelSyncAt: new Date() } })
      return { discovered: discovered.models.length, imported: result.filter((item) => item.action === 'created').length, routed: result.length, removed }
    })
  }

  private async applyProviderImport(provider: { id: string; metadata: Prisma.JsonValue | null; template: { apiProtocol: string } | null }, candidates: DiscoveredModel[], options: { overwritePricing?: boolean }) {
    const defaultCapabilities = new Set((await this.prisma.modelPreset.findMany({ where: { isDefault: true }, select: { capability: true } })).map((item) => item.capability))
    const result: Array<{ id: string; key: string; modelId: string; action: 'created' | 'routed' | 'updated' }> = []
    for (const candidate of candidates) {
      const capability = candidate.capability!
      const vendor = await this.prisma.modelVendor.upsert({
        where: { key: candidate.vendorKey },
        update: {},
        create: { key: candidate.vendorKey, name: candidate.vendorName, sortOrder: candidate.vendorKey === 'other' ? 999 : 500 },
      })
      const baseKey = this.importedModelKey(candidate.id)
      let model = await this.prisma.modelPreset.findFirst({ where: { capability, OR: [{ key: baseKey }, { upstreamModel: candidate.id }] } })
      let action: 'created' | 'routed' | 'updated' = 'routed'
      if (!model) {
        let key = baseKey
        if (await this.prisma.modelPreset.count({ where: { key } })) key = `${candidate.vendorKey}-${baseKey}`.slice(0, 100)
        const isDefault = !defaultCapabilities.has(capability)
        model = await this.createModel({
          key,
          displayName: candidate.displayName,
          description: `${candidate.vendorName} · 自动发现`,
          vendorId: vendor.id,
          upstreamModel: candidate.id,
          capability,
          enabled: true,
          isDefault,
          allowUserKey: true,
          sortOrder: 500,
          flatCreditCost: candidate.flatCreditCost,
          inputCreditsPerMillion: candidate.inputCreditsPerMillion,
          outputCreditsPerMillion: candidate.outputCreditsPerMillion,
          inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion,
          outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion,
          imageCostMicros: candidate.imageCostMicros,
          videoCostMicros: candidate.videoCostMicros,
          badge: candidate.pricingSource === 'none' ? '待定价' : '自动定价',
          options: this.discoveredModelOptions(candidate, String(provider.template?.apiProtocol || this.jsonObject(provider.metadata).apiProtocol || 'openai')),
        })
        defaultCapabilities.add(capability)
        action = 'created'
      } else if (!model.enabled && model.badge === UPSTREAM_OFFLINE_BADGE) {
        // 上游重新上线的模型恢复上架，不需要人工复核。
        await this.prisma.modelPreset.update({ where: { id: model.id }, data: { enabled: true, badge: candidate.pricingSource === 'none' ? '待定价' : '自动定价' } })
        if (options.overwritePricing) await this.overwriteImportedPricing(model.id, candidate)
        action = 'updated'
      } else if (options.overwritePricing) {
        model = await this.overwriteImportedPricing(model.id, candidate)
        action = 'updated'
      }
      if (capability === ModelCapability.VIDEO) {
        const current = this.videoRouteCapabilities(model.options)
        const discovered = (this.discoveredModelOptions(candidate, String(provider.template?.apiProtocol || this.jsonObject(provider.metadata).apiProtocol || 'openai')) as Record<string, unknown>).videoCapabilities as Record<string, unknown>
        const videoCapabilities = { ...current, ...discovered, ...(current?.pricing ? { pricing: current.pricing } : {}) }
        model = await this.prisma.modelPreset.update({
          where: { id: model.id },
          data: { options: { ...this.jsonObject(model.options), videoCapabilities } as Prisma.InputJsonValue },
        })
      }
      const routeOptions = candidate.capability === ModelCapability.VIDEO
        ? { videoCapabilities: (this.discoveredModelOptions(candidate) as Record<string, unknown>).videoCapabilities } as Prisma.InputJsonValue
        : undefined
      await this.prisma.modelProviderRoute.upsert({
        where: { modelPresetId_providerId: { modelPresetId: model.id, providerId: provider.id } },
        update: { upstreamModelOverride: candidate.id, enabled: true, inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion || null, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion || null, imageCostMicros: candidate.imageCostMicros || null, videoCostMicros: candidate.videoCostMicros || null, ...(routeOptions ? { options: routeOptions } : {}) },
        create: { modelPresetId: model.id, providerId: provider.id, upstreamModelOverride: candidate.id, enabled: true, inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion || null, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion || null, imageCostMicros: candidate.imageCostMicros || null, videoCostMicros: candidate.videoCostMicros || null, ...(routeOptions ? { options: routeOptions } : {}) },
      })
      result.push({ id: model.id, key: model.key, modelId: candidate.id, action })
    }
    return result
  }

  private overwriteImportedPricing(modelPresetId: string, candidate: DiscoveredModel) {
    return this.updateModel(modelPresetId, {
      inputCreditsPerMillion: candidate.inputCreditsPerMillion,
      outputCreditsPerMillion: candidate.outputCreditsPerMillion,
      inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion,
      outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion,
      imageCostMicros: candidate.imageCostMicros,
      videoCostMicros: candidate.videoCostMicros,
      ...(candidate.flatCreditCost ? { flatCreditCost: candidate.flatCreditCost } : {}),
    })
  }

  /** 上游已下线的模型：删除路由；渠道直连且无其它路由的预设停用（保留定价版本与分组授权）。 */
  private async pruneProviderModels(providerId: string, upstreamIds: Set<string>) {
    const routes = await this.prisma.modelProviderRoute.findMany({
      where: { providerId },
      select: { id: true, modelPresetId: true, upstreamModelOverride: true, modelPreset: { select: { providerId: true, upstreamModel: true } } },
    })
    const stale = routes.filter((route) => !upstreamIds.has(route.upstreamModelOverride || route.modelPreset.upstreamModel))
    if (!stale.length) return 0
    await this.prisma.$transaction(async (tx) => {
      await tx.modelProviderRoute.deleteMany({ where: { id: { in: stale.map((route) => route.id) } } })
      for (const modelPresetId of new Set(stale.filter((route) => route.modelPreset.providerId === providerId).map((route) => route.modelPresetId))) {
        if (await tx.modelProviderRoute.count({ where: { modelPresetId } })) continue
        await tx.modelPreset.updateMany({ where: { id: modelPresetId, providerId, enabled: true }, data: { enabled: false, isDefault: false, badge: UPSTREAM_OFFLINE_BADGE } })
      }
    })
    return stale.length
  }

  async cancelLocalWorkerTask(providerChannelId: string, taskId: string) {
    const provider = await this.prisma.providerChannel.findUnique({ where: { id: providerChannelId } })
    if (!provider || provider.type !== ProviderType.LOCAL_WORKER) return { requested: false, reason: 'not-local-worker' }
    const baseUrl = await this.assertProviderEndpoint(provider.baseUrl, provider.type)
    const apiKey = this.crypto.decrypt(provider.encryptedApiKey)
    let response: Response
    try {
      response = await fetchNoRedirect(`${baseUrl}/tasks/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
        headers: this.applyAuth(this.headers(provider.customHeaders), provider.authType, apiKey),
        signal: AbortSignal.timeout(Math.min(provider.timeoutMs, 5_000)),
      })
    } catch (error) {
      throw new ServiceUnavailableException(`本地 Worker 取消请求失败：${error instanceof Error ? error.message : '网络错误'}`)
    }
    if (!response.ok && response.status !== 404 && response.status !== 409) throw new ServiceUnavailableException(`本地 Worker 取消请求返回 ${response.status}`)
    return { requested: true, acknowledged: response.ok, status: response.status }
  }

  async checkAllProviders() {
    const providers = await this.prisma.providerChannel.findMany({ where: { enabled: true }, select: { id: true, name: true } })
    const results = await Promise.all(providers.map(async (provider) => {
      try {
        const result = await this.fetchRemoteModels(provider.id)
        return { id: provider.id, name: provider.name, healthy: true, latencyMs: result.latencyMs, modelCount: result.models.length, error: '' }
      } catch (reason) {
        return { id: provider.id, name: provider.name, healthy: false, latencyMs: null, modelCount: 0, error: reason instanceof Error ? reason.message : '连接失败' }
      }
    }))
    return { checked: results.length, healthy: results.filter((item) => item.healthy).length, unhealthy: results.filter((item) => !item.healthy).length, results }
  }

  async resetProviderHealth(id: string) {
    const result = await this.prisma.providerChannel.updateMany({ where: { id }, data: { consecutiveFailures: 0, cooldownUntil: null, lastHealthStatus: null, lastHealthMessage: '管理员已清除故障状态，等待下次检测' } })
    if (!result.count) throw new NotFoundException('上游渠道不存在')
    return { reset: true }
  }

  async listModels(capability?: ModelCapability, includeDisabled = false) {
    if (includeDisabled) {
      return this.prisma.modelPreset.findMany({ where: { ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { vendor: true, provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { orderBy: { createdAt: 'asc' }, include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true, cooldownUntil: true } } } } } })
    }
    const models = await this.prisma.modelPreset.findMany({ where: { enabled: true, ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { vendor: true, provider: { select: { id: true, name: true, type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } }, providerRoutes: { where: { enabled: true }, orderBy: { createdAt: 'asc' }, include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true, cooldownUntil: true, encryptedApiKey: true, lastHealthStatus: true } } } } } })
    return models.filter((model) => this.providerPublished(model.provider) || model.providerRoutes.some((route) => this.providerPublished(route.provider))).map(({ provider, providerRoutes, ...model }) => {
      const routeCount = Number(this.providerPublished(provider)) + providerRoutes.filter((route) => this.providerPublished(route.provider)).length
      const healthyRouteCount = Number(this.providerHealthy(provider)) + providerRoutes.filter((route) => this.providerHealthy(route.provider)).length
      return {
        ...model,
        availability: healthyRouteCount ? 'AVAILABLE' : 'DEGRADED',
        healthyRouteCount,
        routeCount,
        options: model.capability === ModelCapability.VIDEO ? this.effectiveVideoOptions(model.options, providerRoutes, provider) : model.options,
        provider: provider ? this.publicProvider(provider) : null,
        providerRoutes: providerRoutes.map(({ provider: routeProvider, ...route }) => ({ ...route, provider: this.publicProvider(routeProvider) })),
      }
    })
  }

  async userPolicy(userId: string) {
    const [memberships, subscription] = await Promise.all([
      this.prisma.userGroupMember.findMany({ where: { userId, group: { enabled: true } }, include: { group: { include: { modelAccess: { select: { modelPresetId: true, flatCreditCostOverride: true } } } } } }),
      this.prisma.userSubscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
    ])
    const groups = memberships.map((item) => item.group)
    const restricted = groups.filter((group) => group.restrictModels)
    return {
      allowUserByok: true,
      creditRatePercent: groups.length ? Math.min(...groups.map((group) => group.creditRatePercent)) : 100,
      restrictModels: restricted.length > 0,
      allowedModelIds: [...new Set(restricted.flatMap((group) => group.modelAccess.map((item) => item.modelPresetId)))],
      costOverrides: new Map(restricted.flatMap((group) => group.modelAccess.filter((item) => item.flatCreditCostOverride !== null).map((item) => [item.modelPresetId, item.flatCreditCostOverride!] as const))),
      groups: groups.map((group) => ({ id: group.id, name: group.name })),
      subscription: subscription ? { id: subscription.id, status: subscription.status, plan: { id: subscription.plan.id, code: subscription.plan.code, name: subscription.plan.name } } : null,
    }
  }

  async listModelsForUser(userId: string, capability?: ModelCapability) {
    await this.syncStaleUserModels(userId, 4_000)
    const policy = await this.userPolicy(userId)
    const [models, privateModels] = await Promise.all([
      this.prisma.modelPreset.findMany({ where: { enabled: true, ...(capability ? { capability } : {}), ...(policy.restrictModels ? { id: { in: policy.allowedModelIds } } : {}) }, orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { vendor: true, provider: { select: { id: true, name: true, type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } }, providerRoutes: { where: { enabled: true }, select: { id: true, providerId: true, options: true, provider: { select: { type: true, enabled: true, encryptedApiKey: true, lastHealthStatus: true, cooldownUntil: true } } } } } }),
      this.prisma.userModel.findMany({ where: { userId, enabled: true, ...(capability ? { capability } : {}) }, orderBy: [{ capability: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }], include: { vendor: true, routes: { where: { enabled: true }, include: { credential: { select: { enabled: true, lastHealthStatus: true, cooldownUntil: true } } } } } }),
    ])
    const platformModels = models.filter((model) => this.providerPublished(model.provider) || model.providerRoutes.some((route) => this.providerPublished(route.provider))).map((model) => {
      const override = policy.costOverrides.get(model.id)
      const effectiveCreditCost = override ?? Math.ceil(model.flatCreditCost * policy.creditRatePercent / 100)
      const routeCount = Number(this.providerPublished(model.provider)) + model.providerRoutes.filter((route) => this.providerPublished(route.provider)).length
      const healthyRouteCount = Number(this.providerHealthy(model.provider)) + model.providerRoutes.filter((route) => this.providerHealthy(route.provider)).length
      const options = model.options && typeof model.options === 'object' && !Array.isArray(model.options) ? structuredClone(model.options) as Record<string, unknown> : {}
      if (model.capability === ModelCapability.VIDEO) Object.assign(options, this.effectiveVideoOptions(model.options, model.providerRoutes, model.provider))
      const image = options.imageCapabilities && typeof options.imageCapabilities === 'object' && !Array.isArray(options.imageCapabilities) ? options.imageCapabilities as Record<string, unknown> : undefined
      if (image) {
        const raw = image.resolutionPricing && typeof image.resolutionPricing === 'object' && !Array.isArray(image.resolutionPricing) ? image.resolutionPricing as Record<string, unknown> : {}
        image.resolutionPricing = override !== undefined
          ? { '1K': override, '2K': override * 2, '4K': override * 4 }
          : Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Math.ceil(Number(value || 0) * policy.creditRatePercent / 100)]))
      }
      const video = options.videoCapabilities && typeof options.videoCapabilities === 'object' && !Array.isArray(options.videoCapabilities) ? options.videoCapabilities as Record<string, unknown> : undefined
      if (video) {
        const raw = video.pricing && typeof video.pricing === 'object' && !Array.isArray(video.pricing) ? video.pricing as Record<string, unknown> : {}
        video.pricing = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Math.ceil(Number(value || 0) * policy.creditRatePercent / 100)]))
      }
      const { provider, providerRoutes, ...safeModel } = model
      return {
        ...safeModel,
        source: 'PLATFORM',
        provider: provider ? this.publicProvider(provider) : null,
        providerRoutes: providerRoutes.map(({ provider: _provider, ...route }) => route),
        options,
        effectiveCreditCost,
        availability: healthyRouteCount ? 'AVAILABLE' : 'DEGRADED',
        healthyRouteCount,
        routeCount,
      }
    })
    const now = Date.now()
    const userModels = privateModels.map(({ routes, ...model }) => {
      const healthyRoutes = routes.filter((route) => route.credential.enabled && (!route.cooldownUntil || route.cooldownUntil.getTime() <= now) && route.lastHealthStatus !== 'unhealthy' && route.credential.lastHealthStatus !== 'unhealthy')
      return {
        ...model,
        source: 'USER',
        upstreamModel: routes[0]?.upstreamModel || '',
        flatCreditCost: 0,
        effectiveCreditCost: 0,
        inputCreditsPerMillion: 0,
        outputCreditsPerMillion: 0,
        baseInputCreditsPerMillion: 0,
        baseOutputCreditsPerMillion: 0,
        badge: '我的模型',
        healthyRouteCount: healthyRoutes.length,
        routeCount: routes.length,
        availability: healthyRoutes.length ? 'AVAILABLE' : routes.length ? 'DEGRADED' : 'UNCONFIGURED',
        provider: null,
        providerRoutes: [],
      }
    })
    return [...platformModels, ...userModels]
  }

  async createModel(input: Prisma.ModelPresetUncheckedCreateInput) {
    if (input.isDefault) await this.prisma.modelPreset.updateMany({ where: { capability: input.capability }, data: { isDefault: false } })
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.modelPreset.create({ data: input, include: { provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true } } } } } })
      await tx.modelPriceVersion.create({ data: { modelPresetId: model.id, version: 1, ...modelPricingFields(model) } })
      return model
    })
  }

  async updateModel(id: string, input: Prisma.ModelPresetUncheckedUpdateInput) {
    const existing = await this.prisma.modelPreset.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('模型预设不存在')
    const capability = typeof input.capability === 'string' ? input.capability : existing.capability
    if (input.isDefault === true) await this.prisma.modelPreset.updateMany({ where: { capability, id: { not: id } }, data: { isDefault: false } })
    return this.prisma.$transaction(async (tx) => {
      const model = await tx.modelPreset.update({ where: { id }, data: input, include: { provider: { select: { id: true, name: true, type: true, enabled: true } }, providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true } } } } } })
      if (JSON.stringify(modelPricingFields(existing)) !== JSON.stringify(modelPricingFields(model))) {
        const latest = await tx.modelPriceVersion.aggregate({ where: { modelPresetId: id }, _max: { version: true } })
        await tx.modelPriceVersion.create({ data: { modelPresetId: id, version: (latest._max.version || 0) + 1, ...modelPricingFields(model) } })
      }
      return model
    })
  }

  async replaceModelRoutes(modelPresetId: string, routes: Array<{ providerId: string; upstreamModelOverride?: string; enabled?: boolean; priority?: number | null; weight?: number | null; inputCostMicrosPerMillion?: number | null; outputCostMicrosPerMillion?: number | null; imageCostMicros?: number | null; videoCostMicros?: number | null; options?: Record<string, unknown> | null }>) {
    const preset = await this.prisma.modelPreset.findUnique({ where: { id: modelPresetId } })
    if (!preset) throw new NotFoundException('模型预设不存在')
    const unique = [...new Map(routes.map((route) => [route.providerId, route])).values()]
    const providerCount = await this.prisma.providerChannel.count({ where: { id: { in: unique.map((route) => route.providerId) } } })
    if (providerCount !== unique.length) throw new BadRequestException('包含不存在的渠道')
    const normalizedRoutes = unique.map((route, index) => ({
      ...route,
      options: this.normalizeRouteOptions(route.options, preset.capability, route.enabled ?? true, index),
    }))
    await this.prisma.$transaction(async (tx) => {
      await tx.modelProviderRoute.deleteMany({ where: { modelPresetId } })
      if (normalizedRoutes.length) await tx.modelProviderRoute.createMany({ data: normalizedRoutes.map((route) => ({ modelPresetId, providerId: route.providerId, upstreamModelOverride: route.upstreamModelOverride?.trim() || null, enabled: route.enabled ?? true, priority: route.priority ?? null, weight: route.weight ?? null, inputCostMicrosPerMillion: route.inputCostMicrosPerMillion ?? null, outputCostMicrosPerMillion: route.outputCostMicrosPerMillion ?? null, imageCostMicros: route.imageCostMicros ?? null, videoCostMicros: route.videoCostMicros ?? null, options: (route.options ?? undefined) as Prisma.InputJsonValue | undefined })) })
    })
    return this.prisma.modelPreset.findUniqueOrThrow({ where: { id: modelPresetId }, include: { providerRoutes: { include: { provider: { select: { id: true, name: true, type: true, enabled: true, priority: true, weight: true } } } } } })
  }

  async modelPriceVersions(modelPresetId: string) {
    if (!await this.prisma.modelPreset.count({ where: { id: modelPresetId } })) throw new NotFoundException('模型预设不存在')
    return this.prisma.modelPriceVersion.findMany({ where: { modelPresetId }, orderBy: { version: 'desc' }, take: 100 })
  }

  async deleteModel(id: string) {
    await this.prisma.modelPreset.delete({ where: { id } }).catch(() => { throw new NotFoundException('模型预设不存在') })
    return { success: true }
  }

  async getSystemSettings(admin = false) {
    const row = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const newApiPublicUrl = (process.env.NEW_API_PUBLIC_URL?.trim() || process.env.NEW_API_BASE_URL?.trim() || '').replace(/\/+$/, '')
    const {
      encryptedSmtpPassword,
      encryptedLinuxDoClientSecret,
      encryptedSub2apiClientSecret: _encryptedSub2apiClientSecret,
      sub2apiLoginEnabled: _sub2apiLoginEnabled,
      sub2apiBaseUrl: _sub2apiBaseUrl,
      sub2apiClientId: _sub2apiClientId,
      sub2apiClientSecretHint: _sub2apiClientSecretHint,
      sub2apiRedirectUrl: _sub2apiRedirectUrl,
      sub2apiScopes: _sub2apiScopes,
      sub2apiAuthorizeUrl: _sub2apiAuthorizeUrl,
      sub2apiTokenUrl: _sub2apiTokenUrl,
      sub2apiUserInfoUrl: _sub2apiUserInfoUrl,
      ...safe
    } = row
    const chatHomeContent = normalizeChatHomeContent(row.chatHomeContent)
    if (admin) return {
      ...safe,
      newApiLoginReady: Boolean(process.env.NEW_API_BASE_URL?.trim() && process.env.NEW_API_SSO_CLIENT_ID?.trim() && process.env.NEW_API_SSO_CLIENT_SECRET?.trim()),
      newApiConsoleUrl: newApiPublicUrl ? `${newApiPublicUrl}/keys` : '#',
      chatHomeContent,
      quickActionRegistry: await this.capabilities.snapshot(chatHomeContent.quickActions),
      siteContent: normalizeSiteContent(row.siteContent),
      hasSmtpPassword: Boolean(encryptedSmtpPassword),
      hasLinuxDoClientSecret: Boolean(encryptedLinuxDoClientSecret),
    }
    return {
      siteName: row.siteName,
      siteLogoUrl: row.siteLogoUrl,
      supportUrl: row.supportUrl,
      sidebarCreationEnabled: row.sidebarCreationEnabled,
      sidebarCommerceEnabled: row.sidebarCommerceEnabled,
      sidebarOfficeEnabled: row.sidebarOfficeEnabled,
      sidebarPromptsEnabled: row.sidebarPromptsEnabled,
      sidebarPluginsEnabled: row.sidebarPluginsEnabled,
      sidebarProjectsEnabled: row.sidebarProjectsEnabled,
      sidebarAssetsEnabled: row.sidebarAssetsEnabled,
      registrationEnabled: false,
      emailLoginEnabled: false,
      emailVerifyEnabled: false,
      passwordLoginEnabled: false,
      passwordRegistrationEnabled: false,
      linuxDoLoginEnabled: false,
      linuxDoLoginReady: false,
      newApiLoginReady: Boolean(process.env.NEW_API_BASE_URL?.trim() && process.env.NEW_API_SSO_CLIENT_ID?.trim() && process.env.NEW_API_SSO_CLIENT_SECRET?.trim()),
      newApiConsoleUrl: newApiPublicUrl ? `${newApiPublicUrl}/keys` : '#',
      otpResendSeconds: row.otpResendSeconds,
      defaultTheme: row.defaultTheme,
      defaultLanguage: row.defaultLanguage,
      chatUiPreset: row.chatUiPreset,
      chatHomeContent: {
        ...chatHomeContent,
        // Live hot topics are served by /v1/catalog/recommendations. Never
        // expose an old manually saved list as if it were current data.
        doubaoRecommendations: [],
        quickActions: await this.capabilities.filterPublished(chatHomeContent.quickActions),
      },
      siteContent: normalizeSiteContent(row.siteContent),
      imagePromptEnabled: row.imagePromptEnabled,
      imagePromptBillingMode: row.imagePromptBillingMode,
      userByokEnabled: true,
      newApiProvisioningGroups: row.newApiProvisioningGroups,
      rechargeEnabled: false,
      currency: row.currency,
      subscriptionsEnabled: false,
      trialEnabled: false,
      smtpReady: row.smtpEnabled && Boolean(row.smtpHost.trim() && row.smtpFromEmail.trim() && encryptedSmtpPassword.trim()),
      temporaryChatRetentionHours: row.temporaryChatRetentionHours,
    }
  }

  async updateSystemSettings(input: SystemSettingsInput) {
    const { smtpPassword, linuxDoClientSecret, chatHomeContent, siteContent, ...settings } = input
    const previousRetention = settings.mediaRetentionDays
      ? await this.prisma.systemSetting.findUnique({ where: { id: 'global' }, select: { mediaRetentionDays: true } })
      : null
    const data: Prisma.SystemSettingUpdateInput = { ...settings, ...(settings.newApiProvisioningGroups ? { newApiProvisioningGroups: [...new Set(settings.newApiProvisioningGroups.map((item) => item.trim()).filter((item) => item && item !== 'auto'))] } : {}) }
    if (chatHomeContent) data.chatHomeContent = normalizeChatHomeContent(chatHomeContent) as Prisma.InputJsonValue
    if (siteContent) data.siteContent = normalizeSiteContent(siteContent) as unknown as Prisma.InputJsonValue
    if (smtpPassword) {
      data.encryptedSmtpPassword = this.crypto.encrypt(smtpPassword)
      data.smtpPasswordHint = this.crypto.hint(smtpPassword)
    } else if (smtpPassword === '') {
      data.encryptedSmtpPassword = ''
      data.smtpPasswordHint = ''
    }
    if (linuxDoClientSecret) {
      data.encryptedLinuxDoClientSecret = this.crypto.encrypt(linuxDoClientSecret)
      data.linuxDoClientSecretHint = this.crypto.hint(linuxDoClientSecret)
    } else if (linuxDoClientSecret === '') {
      data.encryptedLinuxDoClientSecret = ''
      data.linuxDoClientSecretHint = ''
    }
    await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: data, create: { id: 'global', ...data } as Prisma.SystemSettingCreateInput })
    if (settings.mediaRetentionDays && previousRetention?.mediaRetentionDays !== settings.mediaRetentionDays) {
      await this.assets.applyMediaRetention(settings.mediaRetentionDays)
    }
    return this.getSystemSettings(true)
  }

  private externalUrl(input: string) {
    let url: URL
    try { url = new URL(input.trim()) } catch { throw new BadRequestException('外部入口地址格式不正确') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('外部入口只支持 HTTP 或 HTTPS 地址')
    return url.toString()
  }

  listExternalLinks(includeDisabled = false) {
    return this.prisma.externalNavLink.findMany({
      where: includeDisabled ? {} : { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  }

  createExternalLink(input: Prisma.ExternalNavLinkUncheckedCreateInput) {
    return this.prisma.externalNavLink.create({ data: { ...input, key: input.key.trim().toLowerCase(), name: input.name.trim(), url: this.externalUrl(input.url) } })
  }

  async updateExternalLink(id: string, input: Prisma.ExternalNavLinkUncheckedUpdateInput) {
    if (!await this.prisma.externalNavLink.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('外部入口不存在')
    return this.prisma.externalNavLink.update({ where: { id }, data: {
      ...input,
      ...(typeof input.key === 'string' ? { key: input.key.trim().toLowerCase() } : {}),
      ...(typeof input.name === 'string' ? { name: input.name.trim() } : {}),
      ...(typeof input.url === 'string' ? { url: this.externalUrl(input.url) } : {}),
    } })
  }

  async deleteExternalLink(id: string) {
    await this.prisma.externalNavLink.delete({ where: { id } }).catch(() => { throw new NotFoundException('外部入口不存在') })
    return { success: true }
  }

  listRechargePackages(includeDisabled = false) {
    return this.prisma.rechargePackage.findMany({ where: includeDisabled ? {} : { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] })
  }

  createRechargePackage(input: Prisma.RechargePackageUncheckedCreateInput) {
    return this.prisma.rechargePackage.create({ data: input })
  }

  async updateRechargePackage(id: string, input: Prisma.RechargePackageUncheckedUpdateInput) {
    return this.prisma.rechargePackage.update({ where: { id }, data: input }).catch(() => { throw new NotFoundException('充值套餐不存在') })
  }

  async deleteRechargePackage(id: string) {
    await this.prisma.rechargePackage.delete({ where: { id } }).catch(() => { throw new NotFoundException('充值套餐不存在') })
    return { success: true }
  }

  async listCredentials(userId: string) {
    // 设置页打开时与模型列表一致做一次限时兜底同步，让“上次同步”状态尽量新鲜。
    await this.syncStaleUserModels(userId, 2_000)
    const rows = await this.prisma.userApiCredential.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
    return rows.map((row) => this.publicCredential(row))
  }

  async createCredential(userId: string, input: CredentialInput) {
    if (!input.apiKey?.trim()) throw new BadRequestException('请输入 API 密钥')
    const baseUrl = await this.assertUserProviderUrl(this.onlyCodeProviderBaseUrl())
    if (input.isDefault) await this.prisma.userApiCredential.updateMany({ where: { userId }, data: { isDefault: false } })
    const row = await this.prisma.userApiCredential.create({ data: { userId, name: `OnlyCode-${randomUUID()}`, providerType: ProviderType.NEW_API, baseUrl, encryptedApiKey: this.crypto.encrypt(input.apiKey), apiKeyHint: this.crypto.hint(input.apiKey), authType: ProviderAuthType.BEARER, enabled: input.enabled, autoSyncModels: input.autoSyncModels ?? true, isDefault: input.isDefault, priority: input.priority ?? 0, weight: input.weight ?? 100, lastRotatedAt: new Date(), expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } })
    return this.publicCredential(row)
  }

  private onlyCodeProviderBaseUrl() {
    const baseUrl = this.config.get<string>('NEW_API_PUBLIC_URL') || this.config.get<string>('NEW_API_BASE_URL')
    if (!baseUrl) throw new ServiceUnavailableException('OnlyCode 接入尚未配置')
    return `${baseUrl.replace(/\/+$/, '')}/v1`
  }

  async onlyCodeProvisioningGroups() {
    return (await this.onlyCodeProvisioningGroupDetails(false)).map((item) => item.name)
  }

  async onlyCodeProvisioningGroupDetails(filterAllowed = true) {
    const baseUrl = this.config.get<string>('NEW_API_BASE_URL')
    const clientId = this.config.get<string>('NEW_API_SSO_CLIENT_ID')
    const clientSecret = this.config.get<string>('NEW_API_SSO_CLIENT_SECRET')
    if (!baseUrl || !clientId || !clientSecret) throw new ServiceUnavailableException('OnlyCode 接入尚未配置')
    const response = await fetch(new URL('/api/sso/art/groups', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, details: true }), redirect: 'error', signal: AbortSignal.timeout(10_000) }).catch(() => null)
    if (!response?.ok) throw new ServiceUnavailableException('无法读取 OnlyCode 分组')
    const payload = await response.json().catch(() => null) as { success?: boolean; data?: unknown } | null
    if (!payload?.success || !Array.isArray(payload.data)) throw new ServiceUnavailableException('OnlyCode 分组数据无效')
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const allowed = filterAllowed ? new Set(settings.newApiProvisioningGroups) : null
    const groups: Array<OnlyCodeProvisioningGroup | null> = payload.data.map((item) => {
      if (typeof item === 'string') return !allowed || allowed.has(item) ? { name: item, ratio: 1, models: [], capabilities: [ModelCapability.CHAT] } : null
      if (!item || typeof item !== 'object') return null
      const value = item as Record<string, unknown>
      const name = typeof value.name === 'string' ? value.name : ''
      if (!name || (allowed && !allowed.has(name))) return null
      const models = Array.isArray(value.models) ? [...new Set(value.models.filter((model): model is string => typeof model === 'string'))].sort() : []
      const capabilities: ModelCapability[] = models.length ? [...new Set(models.map(inferModelCapability).filter((capability): capability is ModelCapability => capability !== null))] : [ModelCapability.CHAT]
      return { name, ratio: typeof value.ratio === 'number' && Number.isFinite(value.ratio) ? value.ratio : 1, models, capabilities }
    })
    return groups.filter((item): item is OnlyCodeProvisioningGroup => item !== null).sort((a, b) => a.name.localeCompare(b.name))
  }

  async provisionOnlyCodeCredential(userId: string, provisionKey: string, requestedName?: string) {
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前账号不允许使用个人 API 密钥')
    const settings = await this.prisma.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const group = provisionKey.trim()
    if (!group || group === 'auto' || !settings.newApiProvisioningGroups.includes(group)) throw new ForbiddenException('该分组暂未开放')
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } })
    const username = user?.displayName || user?.email?.split('@')[0] || 'user'
    const fallbackName = `onlyart-${username}-${group}`.replace(/[^\p{L}\p{N}._-]+/gu, '-')
    const candidateName = requestedName?.trim() || fallbackName
    const name = [...candidateName].reduce((value, character) => Buffer.byteLength(value + character, 'utf8') <= 50 ? value + character : value, '')
    const existing = await this.prisma.userApiCredential.findFirst({ where: { userId, name, provisionKey: group } })
    if (existing) {
      try {
        const imported = await this.importCredentialModels(userId, existing.id, { importAll: true })
        return { credential: this.publicCredential(existing), ...imported }
      } catch (error) {
        return { credential: this.publicCredential(existing), imported: 0, availableModels: [], modelSyncError: error instanceof Error ? error.message : '模型同步失败' }
      }
    }
    if (await this.prisma.userApiCredential.count({ where: { userId, name } })) throw new BadRequestException('Key 名称已存在，请换一个名称')
    const identity = await this.prisma.externalIdentity.findFirst({ where: { userId, provider: 'new-api' }, select: { subject: true } })
    if (!identity) throw new NotFoundException('当前账号未绑定 OnlyCode')
    const baseUrl = this.config.get<string>('NEW_API_BASE_URL')
    const clientId = this.config.get<string>('NEW_API_SSO_CLIENT_ID')
    const clientSecret = this.config.get<string>('NEW_API_SSO_CLIENT_SECRET')
    if (!baseUrl || !clientId || !clientSecret) throw new ServiceUnavailableException('OnlyCode 接入尚未配置')
    const response = await fetch(new URL('/api/sso/art/provision-token', baseUrl), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, subject: identity.subject, group, name }), redirect: 'error', signal: AbortSignal.timeout(10_000) }).catch(() => null)
    if (!response?.ok) throw new ServiceUnavailableException('OnlyCode 分组 Key 创建失败')
    const payload = await response.json().catch(() => null) as { success?: boolean; data?: { key?: unknown; token_id?: unknown; group?: unknown } } | null
    const rawKey = typeof payload?.data?.key === 'string' ? payload.data.key.trim() : ''
    if (!payload?.success || !rawKey) throw new ServiceUnavailableException('OnlyCode 未返回有效 Key')
    const key = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`
    const providerBaseUrl = this.onlyCodeProviderBaseUrl()
    const row = await this.prisma.userApiCredential.create({ data: { userId, name, provisionKey: group, externalTokenId: typeof payload.data?.token_id === 'number' ? String(payload.data.token_id) : null, providerType: ProviderType.NEW_API, baseUrl: providerBaseUrl, encryptedApiKey: this.crypto.encrypt(key), apiKeyHint: this.crypto.hint(key), authType: ProviderAuthType.BEARER, enabled: true, isDefault: false, lastRotatedAt: new Date() } })
    try {
      const imported = await this.importCredentialModels(userId, row.id, { importAll: true })
      return { credential: this.publicCredential(row), ...imported }
    } catch (error) {
      return { credential: this.publicCredential(row), imported: 0, availableModels: [], modelSyncError: error instanceof Error ? error.message : '模型同步失败' }
    }
  }

  async updateCredential(userId: string, id: string, input: Partial<CredentialInput>) {
    const existing = await this.prisma.userApiCredential.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('API 凭据不存在')
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const baseUrl = await this.assertUserProviderUrl(this.onlyCodeProviderBaseUrl())
    // 旧渠道切换地址时必须重新输入密钥，避免把原渠道密钥发送给新地址。
    if (this.normalizeBaseUrl(existing.baseUrl) !== baseUrl && !input.apiKey?.trim()) throw new BadRequestException('请重新输入 OnlyCode API 密钥')
    if (input.isDefault) await this.prisma.userApiCredential.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } })
    const row = await this.prisma.userApiCredential.update({ where: { id }, data: {
      templateId: null, providerType: ProviderType.NEW_API, baseUrl, authType: ProviderAuthType.BEARER, customHeaders: Prisma.DbNull,
      ...(input.apiKey ? { encryptedApiKey: this.crypto.encrypt(input.apiKey), apiKeyHint: this.crypto.hint(input.apiKey) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.autoSyncModels !== undefined ? { autoSyncModels: input.autoSyncModels } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
    } })
    return this.publicCredential(row)
  }

  async rotateCredential(userId: string, id: string, apiKey: string, expiresAt?: string | null) {
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const row = await this.prisma.userApiCredential.findFirst({ where: { id, userId } })
    if (!row) throw new NotFoundException('API 凭据不存在')
    const updated = await this.prisma.userApiCredential.update({ where: { id }, data: {
      encryptedApiKey: this.crypto.encrypt(apiKey), apiKeyHint: this.crypto.hint(apiKey), lastRotatedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : expiresAt === null ? null : row.expiresAt,
      lastHealthStatus: null, lastHealthMessage: '密钥已轮换，等待重新检测', lastHealthAt: null, cooldownUntil: null,
    } })
    return this.publicCredential(updated)
  }

  async credentialUsage(userId: string, id?: string) {
    const rows = await this.prisma.userApiCredential.findMany({ where: { userId, ...(id ? { id } : {}) }, orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'asc' }] })
    if (id && !rows.length) throw new NotFoundException('API 凭据不存在')
    const since = new Date(Date.now() - 30 * 86_400_000)
    const jobs = await this.prisma.generationJob.groupBy({ by: ['userCredentialId', 'status'], where: { userId, userCredentialId: { in: rows.map((row) => row.id) }, createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, upstreamCostMicros: true } })
    return rows.map((row) => ({ ...this.publicCredential(row), usage30d: jobs.filter((job) => job.userCredentialId === row.id).reduce((summary, job) => ({ requests: summary.requests + job._count._all, succeeded: summary.succeeded + (job.status === 'SUCCEEDED' ? job._count._all : 0), failed: summary.failed + (job.status === 'FAILED' ? job._count._all : 0), inputTokens: summary.inputTokens + Number(job._sum.inputTokens || 0), outputTokens: summary.outputTokens + Number(job._sum.outputTokens || 0) }), { requests: 0, succeeded: 0, failed: 0, inputTokens: 0, outputTokens: 0 }) }))
  }

  adminByokSummary() {
    const since = new Date(Date.now() - 30 * 86_400_000)
    return Promise.all([
      this.prisma.userApiCredential.count(),
      this.prisma.userApiCredential.count({ where: { enabled: true } }),
      this.prisma.userApiCredential.count({ where: { OR: [{ expiresAt: { lte: new Date(Date.now() + 14 * 86_400_000) } }, { lastHealthStatus: 'unhealthy' }] } }),
      this.prisma.generationJob.aggregate({ where: { userCredentialId: { not: null }, createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } }),
      this.prisma.userApiCredential.findMany({ orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }], take: 200, include: { user: { select: { id: true, displayName: true, email: true } }, _count: { select: { generationJobs: true, modelRoutes: true } } } }),
    ]).then(([total, enabled, attention, usage, credentials]) => ({ total, enabled, attention, usage: { requests: usage._count._all, inputTokens: Number(usage._sum.inputTokens || 0), outputTokens: Number(usage._sum.outputTokens || 0) }, credentials: credentials.map((row) => this.publicCredential(row)) }))
  }

  async deleteCredential(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.userModel.findMany({ where: { userId, routes: { some: { credentialId: id } } }, select: { id: true } })
      const result = await tx.userApiCredential.deleteMany({ where: { id, userId } })
      if (!result.count) throw new NotFoundException('API 凭据不存在')
      // 只清理本次删除后失去全部路由的模型，保留仍绑定其他密钥的模型。
      await this.pruneOrphanUserModels(tx, userId, affected.map((model) => model.id))
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return { success: true }
  }

  async discoverCredentialModels(userId: string, id: string) {
    const credential = await this.prisma.userApiCredential.findFirst({ where: { id, userId }, include: { template: true } })
    if (!credential) throw new NotFoundException('API 凭据不存在')
    if (credential.template && !credential.template.supportsDiscovery) throw new BadRequestException('该渠道不提供模型列表，请手动填写模型 ID 后执行最小调用验证')
    const startedAt = Date.now()
    try {
      const apiKey = this.crypto.decrypt(credential.encryptedApiKey)
      const baseUrl = await this.assertUserProviderUrl(credential.baseUrl)
      const requestHeaders = this.applyAuth(this.headers(credential.customHeaders), credential.authType, apiKey)
      const response = await fetchPublicNoRedirect(`${baseUrl}/models`, {
        headers: requestHeaders,
        signal: AbortSignal.timeout(30_000),
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 300)}`)
      const parsed = JSON.parse(raw) as unknown
      const candidates = await this.describeDiscoveredModels(parsed)
      if (credential.providerType === ProviderType.NEW_API) await this.attachNewApiVideoCapabilities(baseUrl, requestHeaders, candidates)
      const models = candidates.map((item) => item.id)
      if (!models.length) throw new Error('渠道未返回可识别的模型列表')
      const latencyMs = Date.now() - startedAt
      await this.prisma.userApiCredential.update({ where: { id }, data: { lastHealthStatus: 'healthy', lastHealthMessage: `发现 ${models.length} 个模型，${latencyMs}ms`, lastHealthAt: new Date(), lastSuccessAt: new Date(), cooldownUntil: null } })
      return { models, candidates, latencyMs }
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败'
      await this.prisma.userApiCredential.update({ where: { id }, data: { lastHealthStatus: 'unhealthy', lastHealthMessage: message.slice(0, 500), lastHealthAt: new Date(), lastFailureAt: new Date() } })
      throw new BadRequestException(message)
    }
  }

  async importCredentialModels(userId: string, credentialId: string, input: { modelIds?: string[]; importAll?: boolean }) {
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const credential = await this.prisma.userApiCredential.findFirst({ where: { id: credentialId, userId }, include: { template: true } })
    if (!credential) throw new NotFoundException('API 凭据不存在')
    const discovered = await this.discoverCredentialModels(userId, credentialId)
    const selected = new Set((input.importAll ? discovered.candidates.filter((item) => item.importable).map((item) => item.id) : input.modelIds || []).map((item) => item.trim()))
    if (!selected.size) throw new BadRequestException('请选择需要导入的模型')
    const candidates = discovered.candidates.filter((item) => selected.has(item.id) && item.importable && item.capability)
    if (!candidates.length) throw new BadRequestException('选择的模型不属于当前可导入能力')
    const models = await this.applyCredentialCandidates(userId, credential, candidates, await this.defaultUserModelCapabilities(userId), { reactivateRoutes: true })
    return { discovered: discovered.models.length, availableModels: discovered.models, selected: selected.size, imported: models.length, models }
  }

  private async refreshExistingCredentialVideoCapabilities(
    userId: string,
    credential: {
      id: string
      name: string
      priority: number
      weight: number
      providerType: ProviderType
      baseUrl: string
      encryptedApiKey: string
      authType: ProviderAuthType
      customHeaders: Prisma.JsonValue | null
      template: { apiProtocol: string } | null
    },
  ) {
    const routes = await this.prisma.userModelRoute.findMany({
      where: { credentialId: credential.id, userModel: { userId, capability: ModelCapability.VIDEO } },
      select: { upstreamModel: true },
    })
    const modelIds = [...new Set(routes.map((route) => route.upstreamModel))]
    if (!modelIds.length) return []
    const candidates = await this.describeDiscoveredModels(modelIds.map((id) => ({ id })))
    const baseUrl = await this.assertUserProviderUrl(credential.baseUrl)
    const headers = this.applyAuth(this.headers(credential.customHeaders), credential.authType, this.crypto.decrypt(credential.encryptedApiKey))
    await this.attachNewApiVideoCapabilities(baseUrl, headers, candidates)
    const configured = candidates.filter((candidate) => candidate.capability === ModelCapability.VIDEO && candidate.raw.videoCapabilities && typeof candidate.raw.videoCapabilities === 'object')
    if (!configured.length) return []
    await this.applyCredentialCandidates(userId, credential, configured, await this.defaultUserModelCapabilities(userId), { reactivateRoutes: false })
    return configured
  }

  /** 上游模型自动同步：新增上游新模型，并删除已下线的路由与孤立模型。 */
  async syncCredentialModels(userId: string, credentialId: string) {
    return this.withModelSyncLock(`credential:${credentialId}`, async () => {
      const credential = await this.prisma.userApiCredential.findFirst({ where: { id: credentialId, userId }, include: { template: true } })
      if (!credential) throw new NotFoundException('API 凭据不存在')
      let discovered: Awaited<ReturnType<ProvidersService['discoverCredentialModels']>>
      try {
        discovered = await this.discoverCredentialModels(userId, credentialId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (credential.providerType === ProviderType.NEW_API && /HTTP (?:401|403):/.test(message)) {
          const refreshed = await this.refreshExistingCredentialVideoCapabilities(userId, credential)
          if (refreshed.length) {
            await this.prisma.userApiCredential.update({ where: { id: credentialId }, data: {
              lastModelSyncAt: new Date(),
              lastHealthStatus: null,
              lastHealthMessage: `模型列表无权访问；已从公开能力目录刷新 ${refreshed.length} 个既有视频模型`,
              lastHealthAt: new Date(),
            } })
            return { discovered: refreshed.length, availableModels: refreshed.map((item) => item.id), imported: 0, removed: 0, capabilityOnly: true }
          }
        }
        // 同步失败同样推进时间戳，避免定时任务对同一凭据反复重试。
        await this.prisma.userApiCredential.update({ where: { id: credentialId }, data: { lastModelSyncAt: new Date() } })
        throw error
      }
      const suppressed = new Set(credential.suppressedModels)
      const importable = discovered.candidates.filter((item) => item.importable && item.capability)
      const candidates = importable.filter((item) => !suppressed.has(item.id))
      const added = await this.applyCredentialCandidates(userId, credential, candidates, await this.defaultUserModelCapabilities(userId), { reactivateRoutes: false })
      const removed = await this.pruneCredentialModels(userId, credentialId, new Set(importable.map((item) => item.id)))
      await this.prisma.userApiCredential.update({ where: { id: credentialId }, data: { lastModelSyncAt: new Date() } })
      return { discovered: discovered.models.length, availableModels: discovered.models, imported: added.length, removed }
    })
  }

  /** 定时与读时兜底：同步超过间隔未刷新的个人模型。 */
  async syncDueModels() {
    const settings = await this.modelSyncSettings()
    const userSynced = settings.userEnabled ? await this.syncDueUserCredentials(settings.userIntervalMs) : 0
    const channelSynced = settings.channelEnabled ? await this.syncDueProviderChannels(settings.channelIntervalMs) : 0
    return { userSynced, channelSynced }
  }

  /** 读请求兜底：设置页与选择模型打开时，超过一小时未同步则补一次（有超时上限）。 */
  private async syncStaleUserModels(userId: string, maxWaitMs: number) {
    const settings = await this.modelSyncSettings()
    if (!settings.userEnabled) return
    const due = await this.prisma.userApiCredential.findMany({
      where: {
        userId, enabled: true, autoSyncModels: true,
        AND: [
          { OR: [{ templateId: null }, { template: { supportsDiscovery: true } }] },
          { OR: [{ lastModelSyncAt: null }, { lastModelSyncAt: { lt: new Date(Date.now() - USER_MODEL_SYNC_CATCH_UP_MS) } }] },
        ],
      },
      select: { id: true },
      take: 5,
    })
    if (!due.length) return
    const work = Promise.allSettled(due.map((item) => this.syncCredentialModels(userId, item.id))).then(() => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([work, new Promise<void>((resolve) => { timer = setTimeout(resolve, maxWaitMs) })])
    } finally {
      clearTimeout(timer)
    }
  }

  private async syncDueUserCredentials(intervalMs: number) {
    const rows = await this.prisma.userApiCredential.findMany({
      where: {
        enabled: true, autoSyncModels: true,
        AND: [
          { OR: [{ templateId: null }, { template: { supportsDiscovery: true } }] },
          { OR: [{ lastModelSyncAt: null }, { lastModelSyncAt: { lt: new Date(Date.now() - intervalMs) } }] },
        ],
      },
      select: { id: true, userId: true },
      orderBy: { lastModelSyncAt: { sort: 'asc', nulls: 'first' } },
      take: MODEL_SYNC_TICK_LIMIT,
    })
    return this.runModelSyncBatch(rows.map((row) => ({ label: `凭据 ${row.id}`, run: () => this.syncCredentialModels(row.userId, row.id) })))
  }

  private async syncDueProviderChannels(intervalMs: number) {
    const rows = await this.prisma.providerChannel.findMany({
      where: {
        enabled: true, autoSyncModels: true, type: { in: AUTO_SYNC_PROVIDER_TYPES },
        // 仅同步已接入过模型的渠道（存在预设或路由），避免新渠道未经验收就批量上架预设。
        OR: [
          { modelRoutes: { some: {} } },
          { modelPresets: { some: {} } },
          { lastModelSyncAt: { not: null } },
        ],
        AND: [{ OR: [{ lastModelSyncAt: null }, { lastModelSyncAt: { lt: new Date(Date.now() - intervalMs) } }] }],
      },
      select: { id: true },
      orderBy: { lastModelSyncAt: { sort: 'asc', nulls: 'first' } },
      take: MODEL_SYNC_TICK_LIMIT,
    })
    return this.runModelSyncBatch(rows.map((row) => ({ label: `渠道 ${row.id}`, run: () => this.syncProviderModels(row.id) })))
  }

  private async runModelSyncBatch(tasks: Array<{ label: string; run: () => Promise<unknown> }>) {
    let succeeded = 0
    for (let index = 0; index < tasks.length; index += MODEL_SYNC_CONCURRENCY) {
      const results = await Promise.allSettled(tasks.slice(index, index + MODEL_SYNC_CONCURRENCY).map((task) => task.run()))
      results.forEach((result, offset) => {
        if (result.status === 'fulfilled') { succeeded += 1; return }
        this.logger.warn(`上游模型自动同步失败（${tasks[index + offset].label}）：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
      })
    }
    return succeeded
  }

  private async modelSyncSettings() {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: 'global' },
      select: { modelAutoSyncEnabled: true, modelAutoSyncIntervalHours: true, channelModelAutoSyncEnabled: true, channelModelAutoSyncIntervalHours: true },
    })
    return {
      userEnabled: row?.modelAutoSyncEnabled ?? true,
      userIntervalMs: syncIntervalMs(row?.modelAutoSyncIntervalHours),
      channelEnabled: row?.channelModelAutoSyncEnabled ?? true,
      channelIntervalMs: syncIntervalMs(row?.channelModelAutoSyncIntervalHours),
    }
  }

  private withModelSyncLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const running = this.modelSyncLocks.get(key) as Promise<T> | undefined
    if (running) return running
    const promise = Promise.resolve().then(task).finally(() => { this.modelSyncLocks.delete(key) })
    this.modelSyncLocks.set(key, promise)
    return promise
  }

  private defaultUserModelCapabilities(userId: string) {
    return this.prisma.userModel.findMany({ where: { userId, isDefault: true }, select: { capability: true } }).then((rows) => new Set(rows.map((item) => item.capability)))
  }

  private async applyCredentialCandidates(
    userId: string,
    credential: { id: string; name: string; priority: number; weight: number; providerType: ProviderType; template: { apiProtocol: string } | null },
    candidates: DiscoveredModel[],
    defaultCapabilities: Set<ModelCapability>,
    options: { reactivateRoutes: boolean },
  ) {
    const models: Array<{ id: string; key: string; modelId: string }> = []
    for (const candidate of candidates) {
      const capability = candidate.capability!
      const apiProtocol = credential.providerType === ProviderType.NEW_API && capability === ModelCapability.IMAGE && isGeminiImageModel(candidate.id) ? 'gemini' : credential.template?.apiProtocol || 'openai'
      const vendor = await this.prisma.modelVendor.upsert({ where: { key: candidate.vendorKey }, update: {}, create: { key: candidate.vendorKey, name: candidate.vendorName, sortOrder: candidate.vendorKey === 'other' ? 999 : 500 } })
      const existing = await this.prisma.userModel.findFirst({ where: { userId, capability, routes: { some: { upstreamModel: candidate.id } } } })
      if (existing) {
        await this.upgradeUserModelImageCapabilities(existing, candidate, apiProtocol)
        if (capability === ModelCapability.VIDEO) {
          const current = this.videoRouteCapabilities(existing.options)
          const discovered = this.discoveredModelOptions(candidate, apiProtocol).videoCapabilities as Record<string, unknown>
          await this.prisma.userModel.update({ where: { id: existing.id }, data: { options: { ...this.jsonObject(existing.options), videoCapabilities: { ...current, ...discovered, ...(current?.pricing ? { pricing: current.pricing } : {}) } } as Prisma.InputJsonValue } })
        }
      }
      const model = existing || await this.prisma.userModel.create({ data: {
        userId,
        vendorId: vendor.id,
        key: this.privateModelKey(userId, candidate.id),
        displayName: candidate.displayName,
        description: `${candidate.vendorName} · 由 ${credential.name} 自动识别`,
        capability,
        apiProtocol,
        routingStrategy: 'PRIORITY',
        enabled: true,
        isDefault: !defaultCapabilities.has(capability),
        options: { ...this.discoveredModelOptions(candidate, apiProtocol), discovery: { ...(this.discoveredModelOptions(candidate).discovery as Record<string, unknown>), referenceCost: { inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion, imageCostMicros: candidate.imageCostMicros, videoCostMicros: candidate.videoCostMicros } } },
      } })
      if (!existing) defaultCapabilities.add(capability)
      // 手动导入会重新启用路由；自动同步只补缺失路由，不覆盖用户已停用的路由。
      const routeExists = !options.reactivateRoutes && Boolean(existing)
        && await this.prisma.userModelRoute.count({ where: { userModelId: model.id, credentialId: credential.id, upstreamModel: candidate.id } }) > 0
      if (!routeExists) {
        await this.prisma.userModelRoute.upsert({
          where: { userModelId_credentialId_upstreamModel: { userModelId: model.id, credentialId: credential.id, upstreamModel: candidate.id } },
          update: { enabled: true, priority: credential.priority, weight: credential.weight, lastHealthStatus: 'healthy', lastHealthMessage: '模型发现成功', lastHealthAt: new Date(), cooldownUntil: null },
          create: { userModelId: model.id, credentialId: credential.id, upstreamModel: candidate.id, enabled: true, priority: credential.priority, weight: credential.weight, lastHealthStatus: 'healthy', lastHealthMessage: '模型发现成功', lastHealthAt: new Date() },
        })
      }
      models.push({ id: model.id, key: model.key, modelId: candidate.id })
    }
    return models
  }

  /**
   * 同步时把新推导出的图片能力补进已有模型：只把「不支持」升级为「支持」，
   * 不覆盖用户在设置里改过的其它字段。
   */
  private async upgradeUserModelImageCapabilities(
    existing: { id: string; capability: ModelCapability; options: Prisma.JsonValue | null },
    candidate: DiscoveredModel,
    apiProtocol: string,
  ) {
    if (existing.capability !== ModelCapability.IMAGE) return
    const options = this.jsonObject(existing.options)
    const current = options.imageCapabilities && typeof options.imageCapabilities === 'object' && !Array.isArray(options.imageCapabilities)
      ? { ...(options.imageCapabilities as Record<string, unknown>) }
      : {}
    const discovered = this.discoveredModelOptions(candidate, apiProtocol).imageCapabilities as Record<string, unknown>
    const upgraded = ['supportsMask', 'supportsReference'].filter((key) => discovered[key] === true && current[key] !== true)
    if (!upgraded.length) return
    for (const key of upgraded) current[key] = true
    await this.prisma.userModel.update({ where: { id: existing.id }, data: { options: { ...options, imageCapabilities: current } as Prisma.InputJsonValue } })
  }

  private async pruneCredentialModels(userId: string, credentialId: string, upstreamIds: Set<string>) {
    const routes = await this.prisma.userModelRoute.findMany({ where: { credentialId }, select: { id: true, userModelId: true, upstreamModel: true } })
    const stale = routes.filter((route) => !upstreamIds.has(route.upstreamModel))
    if (!stale.length) return 0
    await this.prisma.$transaction(async (tx) => {
      await tx.userModelRoute.deleteMany({ where: { id: { in: stale.map((route) => route.id) } } })
      await this.pruneOrphanUserModels(tx, userId, [...new Set(stale.map((route) => route.userModelId))])
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return stale.length
  }

  /** 删除失去全部路由的用户模型，并为受影响能力补上默认模型（与删除密钥一致）。 */
  private async pruneOrphanUserModels(tx: Prisma.TransactionClient, userId: string, modelIds: string[]) {
    if (!modelIds.length) return
    const orphaned = await tx.userModel.findMany({ where: { userId, id: { in: modelIds }, routes: { none: {} } }, select: { id: true, capability: true, isDefault: true } })
    if (!orphaned.length) return
    await tx.userModel.deleteMany({ where: { userId, id: { in: orphaned.map((model) => model.id) }, routes: { none: {} } } })
    for (const capability of new Set(orphaned.filter((model) => model.isDefault).map((model) => model.capability))) {
      if (await tx.userModel.findFirst({ where: { userId, capability, isDefault: true } })) continue
      const replacement = await tx.userModel.findFirst({
        where: { userId, capability, enabled: true, routes: { some: { enabled: true, credential: { enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
      if (replacement) await tx.userModel.update({ where: { id: replacement.id }, data: { isDefault: true } })
    }
  }

  /** 用户手动删除的模型不再被自动同步加回。 */
  private async suppressCredentialModels(tx: Prisma.TransactionClient, routes: Array<{ credentialId: string; upstreamModel: string }>) {
    const grouped = new Map<string, string[]>()
    for (const route of routes) grouped.set(route.credentialId, [...(grouped.get(route.credentialId) || []), route.upstreamModel])
    for (const [credentialId, upstreamModels] of grouped) {
      const credential = await tx.userApiCredential.findUnique({ where: { id: credentialId }, select: { suppressedModels: true } })
      if (!credential) continue
      const merged = [...new Set([...credential.suppressedModels, ...upstreamModels])].slice(-SUPPRESSED_MODEL_LIMIT)
      await tx.userApiCredential.update({ where: { id: credentialId }, data: { suppressedModels: merged } })
    }
  }

  listPrivateModels(userId: string) {
    return this.prisma.userModel.findMany({ where: { userId }, orderBy: [{ capability: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }], include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  private privateModelKey(userId: string, displayName: string) {
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'model'
    return `private:${userId.slice(-6)}:${slug}:${Date.now().toString(36)}`
  }

  private async validatePrivateRoutes(userId: string, routes: UserModelInput['routes']) {
    if (!routes.length) throw new BadRequestException('私有模型至少需要绑定一个 API 密钥')
    const normalized = routes.map((route) => ({ ...route, credentialId: route.credentialId.trim(), upstreamModel: route.upstreamModel.trim(), priority: route.priority ?? 0, weight: Math.max(1, route.weight ?? 100), enabled: route.enabled ?? true }))
    if (normalized.some((route) => !route.credentialId || !route.upstreamModel)) throw new BadRequestException('密钥和上游模型 ID 不能为空')
    const ids = [...new Set(normalized.map((route) => route.credentialId))]
    if (await this.prisma.userApiCredential.count({ where: { userId, id: { in: ids } } }) !== ids.length) throw new ForbiddenException('包含不属于当前用户的 API 密钥')
    return [...new Map(normalized.map((route) => [`${route.credentialId}:${route.upstreamModel}`, route])).values()]
  }

  async createPrivateModel(userId: string, input: UserModelInput) {
    if (!(await this.userPolicy(userId)).allowUserByok) throw new ForbiddenException('当前用户分组或套餐不允许使用个人 API 密钥')
    const routes = await this.validatePrivateRoutes(userId, input.routes)
    if (input.isDefault) await this.prisma.userModel.updateMany({ where: { userId, capability: input.capability }, data: { isDefault: false } })
    return this.prisma.userModel.create({ data: {
      userId, key: this.privateModelKey(userId, input.displayName), displayName: input.displayName.trim(), description: input.description?.trim() || '', vendorId: input.vendorId || null, capability: input.capability, apiProtocol: input.apiProtocol || 'openai', routingStrategy: input.routingStrategy || 'PRIORITY', enabled: input.enabled ?? true, isDefault: input.isDefault ?? false, options: input.options as Prisma.InputJsonValue,
      routes: { create: routes },
    }, include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  async updatePrivateModel(userId: string, id: string, input: Partial<Omit<UserModelInput, 'routes'>>) {
    const existing = await this.prisma.userModel.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('私有模型不存在')
    const capability = input.capability || existing.capability
    if (input.isDefault) await this.prisma.userModel.updateMany({ where: { userId, capability, id: { not: id } }, data: { isDefault: false } })
    return this.prisma.userModel.update({ where: { id }, data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId || null } : {}),
      ...(input.capability !== undefined ? { capability: input.capability } : {}),
      ...(input.apiProtocol !== undefined ? { apiProtocol: input.apiProtocol } : {}),
      ...(input.routingStrategy !== undefined ? { routingStrategy: input.routingStrategy } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      ...(input.options !== undefined ? { options: input.options as Prisma.InputJsonValue } : {}),
    }, include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  async replacePrivateModelRoutes(userId: string, id: string, routesInput: UserModelInput['routes']) {
    if (!await this.prisma.userModel.count({ where: { id, userId } })) throw new NotFoundException('私有模型不存在')
    const routes = await this.validatePrivateRoutes(userId, routesInput)
    await this.prisma.$transaction(async (tx) => {
      await tx.userModelRoute.deleteMany({ where: { userModelId: id } })
      await tx.userModelRoute.createMany({ data: routes.map((route) => ({ userModelId: id, ...route })) })
    })
    return this.prisma.userModel.findUniqueOrThrow({ where: { id }, include: { vendor: true, routes: { include: { credential: { select: { id: true, name: true, apiKeyHint: true, enabled: true, lastHealthStatus: true } } } } } })
  }

  async deletePrivateModel(userId: string, id: string) {
    const model = await this.prisma.userModel.findFirst({ where: { id, userId }, select: { id: true, routes: { select: { credentialId: true, upstreamModel: true } } } })
    if (!model) throw new NotFoundException('私有模型不存在')
    await this.prisma.$transaction(async (tx) => {
      await tx.userModel.deleteMany({ where: { id, userId } })
      await this.suppressCredentialModels(tx, model.routes)
    })
    return { success: true }
  }

  private async resolvePreset(userId: string, requestedModel: string | undefined, capability: ModelCapability): Promise<ResolvedPreset> {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    const policy = await this.userPolicy(userId)
    const configuredDefault = capability === ModelCapability.CHAT ? settings?.defaultChatModelKey : capability === ModelCapability.IMAGE ? settings?.defaultImageModelKey : undefined
    const requested = requestedModel?.trim()
    const videoAliases: Record<string, string> = {
      'sora 2': 'sora-2',
      sora2: 'sora-2',
      'grok imagine video': 'grok-imagine-video',
    }
    const lookup = capability === ModelCapability.VIDEO && requested
      ? videoAliases[requested.toLowerCase()] || requested
      : requested || configuredDefault || undefined
    const accessWhere = policy.restrictModels ? { id: { in: policy.allowedModelIds } } : {}
    const include = { provider: true, providerRoutes: { include: { provider: true } } } as const
    const preset = await this.prisma.modelPreset.findFirst({ where: { capability, enabled: true, ...accessWhere, ...(lookup ? { OR: [{ key: lookup }, { displayName: lookup }, { upstreamModel: lookup }] } : { isDefault: true }) }, include })
      || (!lookup ? await this.prisma.modelPreset.findFirst({ where: { capability, enabled: true, ...accessWhere }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }], include }) : null)
    if (lookup && !preset) {
      if (policy.restrictModels) throw new ForbiddenException('当前用户分组无权使用该模型')
      throw new NotFoundException('模型未配置或已停用')
    }
    const model = preset?.upstreamModel || lookup || (capability === ModelCapability.CHAT ? this.config.get<string>('AI_CHAT_MODEL') : capability === ModelCapability.VIDEO ? 'grok-imagine-video' : this.config.get<string>('AI_IMAGE_MODEL')) || 'default'
    const creditCost = preset ? policy.costOverrides.get(preset.id) ?? Math.ceil(preset.flatCreditCost * policy.creditRatePercent / 100) : 1
    return { preset, model, creditCost, policy, settings }
  }

  private async resolvePrivateCandidates(userId: string, requestedModel: string | undefined, capability: ModelCapability): Promise<ResolvedProvider[] | null> {
    const [settings, policy] = await Promise.all([this.prisma.systemSetting.findUnique({ where: { id: 'global' } }), this.userPolicy(userId)])
    if (!policy.allowUserByok) return null
    const requested = requestedModel?.trim()
    const model = await this.prisma.userModel.findFirst({
      where: { userId, capability, enabled: true, ...(requested ? { OR: [{ key: requested }, { displayName: requested }] } : { isDefault: true }) },
      include: { routes: { where: { enabled: true }, include: { credential: true } } },
    })
    if (!model) return null
    const pricePreset = await this.prisma.modelPreset.findFirst({
      where: {
        capability,
        enabled: true,
        OR: [
          { key: model.key },
          ...model.routes.map((route) => ({ upstreamModel: route.upstreamModel })),
        ],
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    })
    const now = Date.now()
    if (!model.routes.length) throw new BadRequestException('私有模型未绑定可用的密钥路由，请刷新模型列表或重新接入密钥')
    const available = model.routes.filter((route) => route.credential.enabled && (!route.credential.expiresAt || route.credential.expiresAt.getTime() > now) && (!route.cooldownUntil || route.cooldownUntil.getTime() <= now) && (!route.credential.cooldownUntil || route.credential.cooldownUntil.getTime() <= now))
    if (!available.length) throw new BadRequestException('私有模型的密钥已停用、过期或暂时冷却，请检查密钥状态或稍后重试')
    const publicRoutes = []
    for (const route of available) {
      try { await this.assertUserProviderUrl(route.credential.baseUrl); publicRoutes.push(route) } catch { /* Ignore unsafe legacy BYOK routes at execution time. */ }
    }
    if (!publicRoutes.length) throw new BadRequestException('私有模型没有安全可用的公网密钥地址，请检测密钥或调整路由')
    const orderedRoutes = this.routing.orderPrivate(
      publicRoutes.map((route) => ({
        value: route,
        priority: route.priority || route.credential.priority,
        weight: route.weight || route.credential.weight,
        createdAt: route.createdAt
      })),
      model.routingStrategy
    )
    const apiProtocol: ResolvedProvider['apiProtocol'] = model.apiProtocol === 'anthropic' || model.apiProtocol === 'gemini' ? model.apiProtocol : 'openai'
    const modelOptions = model.options && typeof model.options === 'object' && !Array.isArray(model.options) ? model.options as Record<string, unknown> : {}
    return orderedRoutes.map((route) => ({
      source: 'user', credentialId: route.credentialId, routeId: route.id, label: `${model.displayName} · ${route.credential.name}`, type: route.credential.providerType, baseUrl: route.credential.baseUrl, apiKey: this.crypto.decrypt(route.credential.encryptedApiKey), authType: route.credential.authType, headers: this.headers(route.credential.customHeaders), timeoutMs: 120_000, model: route.upstreamModel, presetKey: model.key, creditCost: 0, settlementCurrency: settings?.currency ?? 'CNY', creditValueMicros: settings?.creditValueMicros ?? 10_000, pricingUsdExchangeRateMicros: settings?.pricingUsdExchangeRateMicros ?? 1_000_000, inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0, imageCostMicros: 0, videoCostMicros: 0, inputCreditsPerMillion: 0, outputCreditsPerMillion: 0, baseInputCreditsPerMillion: pricePreset?.inputCreditsPerMillion ?? 0, baseOutputCreditsPerMillion: pricePreset?.outputCreditsPerMillion ?? 0, creditRatePercent: policy.creditRatePercent, apiProtocol, nativeSearchProvider: this.nativeSearchProvider(route.credential.baseUrl, apiProtocol, model.options),
      options: modelOptions,
      imageCapabilities: modelOptions.imageCapabilities && typeof modelOptions.imageCapabilities === 'object' ? modelOptions.imageCapabilities as Record<string, unknown> : undefined,
      videoCapabilities: modelOptions.videoCapabilities && typeof modelOptions.videoCapabilities === 'object' ? modelOptions.videoCapabilities as Record<string, unknown> : undefined,
    }))
  }

  async resolveCandidates(userId: string, requestedModel: string | undefined, capability: ModelCapability, requirements: Record<string, unknown> = {}): Promise<ResolvedProvider[]> {
    const requiredSource = this.routing.sourceRequirement(requirements.providerSource)
    // 指定个人模型时保留选择；平台模型使用 BYOK 时仍沿用个人默认模型。
    const privateModel = requiredSource === 'user' && !requestedModel?.trim().startsWith('private:') ? undefined : requestedModel
    const privateCandidates = requiredSource === 'platform' ? null : await this.resolvePrivateCandidates(userId, privateModel, capability)
    if (privateCandidates) return privateCandidates
    const { preset, model, creditCost, policy, settings } = await this.resolvePreset(userId, requestedModel, capability)
    const candidates: ResolvedProvider[] = []
    const presetOptions = preset?.options && typeof preset.options === 'object' && !Array.isArray(preset.options) ? preset.options as Record<string, unknown> : {}
    const configuredProtocol = String(presetOptions.apiProtocol || 'openai').toLowerCase()
    const apiProtocol: ResolvedProvider['apiProtocol'] = configuredProtocol === 'anthropic' || configuredProtocol === 'gemini' ? configuredProtocol : 'openai'
    const basePricing = {
      settlementCurrency: settings?.currency ?? 'CNY',
      creditValueMicros: settings?.creditValueMicros ?? 10000,
      pricingUsdExchangeRateMicros: settings?.pricingUsdExchangeRateMicros ?? 1_000_000,
      inputCostMicrosPerMillion: preset?.inputCostMicrosPerMillion ?? 0,
      outputCostMicrosPerMillion: preset?.outputCostMicrosPerMillion ?? 0,
      imageCostMicros: preset?.imageCostMicros ?? 0,
      videoCostMicros: preset?.videoCostMicros ?? 0,
      baseInputCreditsPerMillion: preset?.inputCreditsPerMillion ?? 0,
      baseOutputCreditsPerMillion: preset?.outputCreditsPerMillion ?? 0,
      inputCreditsPerMillion: Math.ceil((preset?.inputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100),
      outputCreditsPerMillion: Math.ceil((preset?.outputCreditsPerMillion ?? 0) * policy.creditRatePercent / 100),
      imageCapabilities: presetOptions.imageCapabilities && typeof presetOptions.imageCapabilities === 'object' && !Array.isArray(presetOptions.imageCapabilities) ? presetOptions.imageCapabilities as Record<string, unknown> : undefined,
      videoCapabilities: presetOptions.videoCapabilities && typeof presetOptions.videoCapabilities === 'object' && !Array.isArray(presetOptions.videoCapabilities) ? presetOptions.videoCapabilities as Record<string, unknown> : undefined,
      creditRatePercent: policy.creditRatePercent,
      apiProtocol,
    }

    if (requiredSource !== 'platform' && policy.allowUserByok && preset?.allowUserKey !== false && (preset?.provider?.allowUserKeys ?? true)) {
      const credentials = await this.prisma.userApiCredential.findMany({ where: { userId, enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
      const compatibleTypes = new Set([preset?.provider?.type, ...(preset?.providerRoutes || []).map((route) => route.provider.type)].filter(Boolean))
      const ordered = [...credentials].sort((a, b) => Number(compatibleTypes.has(b.providerType)) - Number(compatibleTypes.has(a.providerType)))
      for (const credential of ordered) {
        try { await this.assertUserProviderUrl(credential.baseUrl) } catch { continue }
        candidates.push({ source: 'user', credentialId: credential.id, label: credential.name, type: credential.providerType, baseUrl: credential.baseUrl, apiKey: this.crypto.decrypt(credential.encryptedApiKey), authType: credential.authType, headers: this.headers(credential.customHeaders), timeoutMs: 120_000, model, presetKey: preset?.key, creditCost: this.routing.credentialCreditCost(requiredSource, creditCost), ...basePricing, options: presetOptions, nativeSearchProvider: this.nativeSearchProvider(credential.baseUrl, apiProtocol, presetOptions), inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0, imageCostMicros: 0, videoCostMicros: 0, ...(requiredSource === 'user' ? { inputCreditsPerMillion: 0, outputCreditsPerMillion: 0 } : {}) })
      }
    }

    const now = Date.now()
    const allConfiguredRoutes = (preset?.providerRoutes || []).filter((route) => route.enabled && route.provider.enabled && this.providerReady(route.provider))
    const configuredRoutes = allConfiguredRoutes.filter((route) => capability !== ModelCapability.VIDEO || this.routeSupportsVideo(route.options, requirements))
    const readyRoutes = configuredRoutes.filter((route) => !route.provider.cooldownUntil || route.provider.cooldownUntil.getTime() <= now)
    // Cooldown keeps an unhealthy route behind healthy alternatives. It must not make the only
    // configured route look unbound, otherwise admins cannot verify a corrected upstream.
    const routes = this.routing.orderPlatform(
      (readyRoutes.length ? readyRoutes : configuredRoutes).map((route) => ({
        value: route,
        priority: route.priority ?? route.provider.priority,
        weight: route.weight ?? route.provider.weight
      }))
    )
    if (requiredSource !== 'user') for (const route of routes) {
      if (!await this.providerEndpointAllowed(route.provider.baseUrl, route.provider.type)) continue
      candidates.push({ source: 'admin', providerId: route.provider.id, routeId: route.id, label: route.provider.name, type: route.provider.type, baseUrl: route.provider.baseUrl, apiKey: this.crypto.decrypt(route.provider.encryptedApiKey), authType: route.provider.authType, headers: this.headers(route.provider.customHeaders), timeoutMs: route.provider.timeoutMs, model: route.upstreamModelOverride || model, presetKey: preset?.key, creditCost, ...basePricing, options: { ...presetOptions, ...routeOptionsRecord(route.options) }, nativeSearchProvider: this.nativeSearchProvider(route.provider.baseUrl, apiProtocol, route.options, presetOptions, route.provider.metadata), videoCapabilities: this.routeVideoCapabilities(route.options, basePricing.videoCapabilities), inputCostMicrosPerMillion: route.inputCostMicrosPerMillion ?? basePricing.inputCostMicrosPerMillion, outputCostMicrosPerMillion: route.outputCostMicrosPerMillion ?? basePricing.outputCostMicrosPerMillion, imageCostMicros: route.imageCostMicros ?? basePricing.imageCostMicros, videoCostMicros: route.videoCostMicros ?? basePricing.videoCostMicros })
    }

    if (requiredSource !== 'user' && !allConfiguredRoutes.length && preset?.provider?.enabled && this.providerReady(preset.provider)) {
      if (await this.providerEndpointAllowed(preset.provider.baseUrl, preset.provider.type)) candidates.push({ source: 'admin', providerId: preset.provider.id, label: preset.provider.name, type: preset.provider.type, baseUrl: preset.provider.baseUrl, apiKey: this.crypto.decrypt(preset.provider.encryptedApiKey), authType: preset.provider.authType, headers: this.headers(preset.provider.customHeaders), timeoutMs: preset.provider.timeoutMs, model, presetKey: preset.key, creditCost, ...basePricing, options: presetOptions, nativeSearchProvider: this.nativeSearchProvider(preset.provider.baseUrl, apiProtocol, presetOptions, preset.provider.metadata) })
    }

    const envKey = this.config.get<string>('AI_PROVIDER_API_KEY') || ''
    const envBase = this.config.get<string>('AI_PROVIDER_BASE_URL') || 'https://api.openai.com/v1'
    if (requiredSource !== 'user' && envKey) {
      const baseUrl = await this.assertProviderEndpoint(envBase, ProviderType.OPENAI_COMPATIBLE)
      candidates.push({ source: 'environment', label: '环境变量渠道', type: ProviderType.OPENAI_COMPATIBLE, baseUrl, apiKey: envKey, authType: ProviderAuthType.BEARER, headers: {}, timeoutMs: 120_000, model, presetKey: preset?.key, creditCost, ...basePricing, options: presetOptions, nativeSearchProvider: this.nativeSearchProvider(baseUrl, apiProtocol, presetOptions) })
    }
    if (!candidates.length && capability === ModelCapability.VIDEO && allConfiguredRoutes.length && !configuredRoutes.length) throw new BadRequestException('当前视频规格没有可用上游渠道，请调整分辨率、时长或画面比例')
    if (!candidates.length && requiredSource === 'user') throw new ServiceUnavailableException('图片反推当前由用户 BYOK 承担费用，请先在设置中添加可用的个人 API 密钥和聊天模型')
    if (!candidates.length && requiredSource === 'platform') throw new ServiceUnavailableException('图片反推尚未绑定可用的平台视觉模型渠道')
    if (!candidates.length) throw new ServiceUnavailableException('模型未绑定可用渠道，请在管理端配置并通过渠道检测，或在设置中添加可用的个人 API 密钥')
    return candidates
  }

  async resolve(userId: string, requestedModel: string | undefined, capability: ModelCapability, requirements: Record<string, unknown> = {}): Promise<ResolvedProvider> {
    return (await this.resolveCandidates(userId, requestedModel, capability, requirements))[0]
  }

  async recordProviderResult(providerId: string | undefined, success: boolean, message = '') {
    return this.health.recordProviderResult(providerId, success, message)
  }

  async recordCandidateResult(candidate: Pick<ResolvedProvider, 'providerId' | 'credentialId' | 'routeId'>, success: boolean, message = '') {
    return this.health.recordCandidateResult(candidate, success, message)
  }

  recordCredentialUsage(credentialId: string | undefined, inputTokens: number, outputTokens: number) {
    if (!credentialId || (!inputTokens && !outputTokens)) return Promise.resolve()
    return this.prisma.userApiCredential.updateMany({ where: { id: credentialId }, data: { inputTokens: { increment: BigInt(Math.max(0, inputTokens)) }, outputTokens: { increment: BigInt(Math.max(0, outputTokens)) }, lastUsedAt: new Date() } }).then(() => undefined)
  }

  buildRequestHeaders(provider: ResolvedProvider, protocol: 'openai' | 'claude' | 'gemini' = 'openai', contentType: string | undefined = 'application/json') {
    const headers: Record<string, string> = { ...provider.headers }
    if (contentType) headers['Content-Type'] = contentType
    else { delete headers['Content-Type']; delete headers['content-type'] }
    this.applyAuth(headers, provider.authType, provider.apiKey)
    if (protocol === 'claude') {
      headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] ||= '2023-06-01'
    }
    if (protocol === 'gemini') headers['x-goog-api-key'] = provider.apiKey
    return headers
  }
}
