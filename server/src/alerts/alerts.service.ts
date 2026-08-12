import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { NotificationType, Prisma } from '@prisma/client'
import { createHmac } from 'node:crypto'
import { CredentialCryptoService } from '../providers/credential-crypto.service'
import { PrismaService } from '../prisma/prisma.service'

type RuleInput = { enabled?: boolean; severity?: string; cooldownMinutes?: number; notifyInApp?: boolean; notifyWebhook?: boolean; webhookUrl?: string; webhookSecret?: string }
type Candidate = { fingerprint: string; title: string; message: string; source: string; targetId?: string; metadata?: Record<string, unknown> }

const DEFAULT_RULES = [
  { key: 'provider_unhealthy', name: '上游模型渠道异常', description: '渠道连续失败、健康检查异常或进入冷却时触发。', severity: 'CRITICAL', cooldownMinutes: 15 },
  { key: 'payment_channel_invalid', name: '支付渠道配置异常', description: '启用中的收款渠道配置校验失败时触发。', severity: 'HIGH', cooldownMinutes: 30 },
  { key: 'moderation_backlog', name: '内容审核积压', description: '存在待管理员处置的敏感内容事件时触发。', severity: 'MEDIUM', cooldownMinutes: 60 },
  { key: 'support_urgent', name: '紧急客服工单', description: '存在未关闭的紧急工单时触发。', severity: 'HIGH', cooldownMinutes: 30 },
]

@Injectable()
export class AlertsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService) {}

  async onModuleInit() {
    await Promise.all(DEFAULT_RULES.map((rule) => this.prisma.alertRule.upsert({ where: { key: rule.key }, update: {}, create: rule })))
  }

  async listRules() {
    return this.prisma.alertRule.findMany({ orderBy: [{ enabled: 'desc' }, { severity: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { events: true } } } }).then((rows) => rows.map((row) => ({ ...row, encryptedWebhookSecret: undefined, hasWebhookSecret: Boolean(row.encryptedWebhookSecret) })))
  }

  listEvents(status?: string) {
    return this.prisma.alertEvent.findMany({ where: status ? { status } : undefined, orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }], take: 300, include: { rule: { select: { key: true, name: true, severity: true, mutedUntil: true } } } })
  }

  async updateRule(id: string, input: RuleInput) {
    const before = await this.prisma.alertRule.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('告警规则不存在')
    if (input.severity && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(input.severity)) throw new BadRequestException('告警级别无效')
    if (input.cooldownMinutes !== undefined && (!Number.isInteger(input.cooldownMinutes) || input.cooldownMinutes < 1 || input.cooldownMinutes > 10080)) throw new BadRequestException('静默间隔必须为 1 到 10080 分钟')
    if (input.webhookUrl !== undefined) this.assertWebhookUrl(input.webhookUrl)
    const data: Prisma.AlertRuleUpdateInput = {
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.severity === undefined ? {} : { severity: input.severity }),
      ...(input.cooldownMinutes === undefined ? {} : { cooldownMinutes: input.cooldownMinutes }),
      ...(input.notifyInApp === undefined ? {} : { notifyInApp: input.notifyInApp }),
      ...(input.notifyWebhook === undefined ? {} : { notifyWebhook: input.notifyWebhook }),
      ...(input.webhookUrl === undefined ? {} : { webhookUrl: input.webhookUrl.trim() }),
    }
    if (input.webhookSecret) { data.encryptedWebhookSecret = this.crypto.encrypt(input.webhookSecret); data.webhookSecretHint = this.crypto.hint(input.webhookSecret) }
    else if (input.webhookSecret === '') { data.encryptedWebhookSecret = ''; data.webhookSecretHint = '' }
    return this.prisma.alertRule.update({ where: { id }, data }).then((row) => ({ ...row, encryptedWebhookSecret: undefined, hasWebhookSecret: Boolean(row.encryptedWebhookSecret) }))
  }

  async muteRule(id: string, minutes: number) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200) throw new BadRequestException('静默时长必须为 1 到 43200 分钟')
    const mutedUntil = new Date(Date.now() + minutes * 60_000)
    return this.prisma.alertRule.update({ where: { id }, data: { mutedUntil } }).catch(() => { throw new NotFoundException('告警规则不存在') })
  }

  async acknowledge(id: string, adminId: string) {
    return this.prisma.alertEvent.updateMany({ where: { id, status: { in: ['OPEN', 'MUTED'] } }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: adminId } }).then((result) => { if (!result.count) throw new BadRequestException('告警不存在或已经处理'); return { acknowledged: true } })
  }

  async resolve(id: string) {
    return this.prisma.alertEvent.updateMany({ where: { id, status: { not: 'RESOLVED' } }, data: { status: 'RESOLVED', resolvedAt: new Date() } }).then((result) => { if (!result.count) throw new BadRequestException('告警不存在或已经恢复'); return { resolved: true } })
  }

  async evaluate() {
    const rules = await this.prisma.alertRule.findMany({ where: { enabled: true } })
    const active = new Map<string, Candidate[]>()
    const [providers, paymentChannels, moderationOpen, supportUrgent] = await Promise.all([
      this.prisma.providerChannel.findMany({ where: { enabled: true, OR: [{ lastHealthStatus: 'unhealthy' }, { consecutiveFailures: { gte: 3 } }, { cooldownUntil: { gt: new Date() } }] }, select: { id: true, name: true, lastHealthMessage: true, consecutiveFailures: true, cooldownUntil: true } }),
      this.prisma.paymentChannel.findMany({ where: { enabled: true, lastHealthStatus: 'invalid' }, select: { id: true, name: true, providerKey: true, lastError: true } }),
      this.prisma.moderationEvent.count({ where: { status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { priority: 'URGENT', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    ])
    active.set('provider_unhealthy', providers.map((item) => ({ fingerprint: item.id, title: `模型渠道异常：${item.name}`, message: item.lastHealthMessage || `连续失败 ${item.consecutiveFailures} 次`, source: 'provider_channel', targetId: item.id, metadata: { consecutiveFailures: item.consecutiveFailures, cooldownUntil: item.cooldownUntil } })))
    active.set('payment_channel_invalid', paymentChannels.map((item) => ({ fingerprint: item.id, title: `支付渠道异常：${item.name}`, message: item.lastError || '渠道配置校验失败', source: 'payment_channel', targetId: item.id, metadata: { providerKey: item.providerKey } })))
    active.set('moderation_backlog', moderationOpen ? [{ fingerprint: 'global', title: '内容审核积压', message: `当前有 ${moderationOpen} 条内容审核事件待处理`, source: 'moderation', metadata: { openCount: moderationOpen } }] : [])
    active.set('support_urgent', supportUrgent ? [{ fingerprint: 'global', title: '存在紧急客服工单', message: `当前有 ${supportUrgent} 个紧急工单未关闭`, source: 'support', metadata: { openCount: supportUrgent } }] : [])
    let raised = 0, resolved = 0
    for (const rule of rules) {
      const candidates = active.get(rule.key) || []
      for (const candidate of candidates) { if (await this.raise(rule, candidate)) raised += 1 }
      const fingerprints = candidates.map((item) => item.fingerprint)
      const stale = await this.prisma.alertEvent.findMany({ where: { ruleId: rule.id, status: { not: 'RESOLVED' }, ...(fingerprints.length ? { fingerprint: { notIn: fingerprints } } : {}) }, select: { id: true } })
      if (stale.length) { await this.prisma.alertEvent.updateMany({ where: { id: { in: stale.map((item) => item.id) } }, data: { status: 'RESOLVED', resolvedAt: new Date() } }); resolved += stale.length }
    }
    return { evaluated: rules.length, raised, resolved, active: [...active.values()].reduce((sum, items) => sum + items.length, 0) }
  }

  private async raise(rule: { id: string; key: string; name: string; enabled: boolean; severity: string; cooldownMinutes: number; notifyInApp: boolean; notifyWebhook: boolean; webhookUrl: string; encryptedWebhookSecret: string; mutedUntil: Date | null }, candidate: Candidate) {
    const existing = await this.prisma.alertEvent.findUnique({ where: { ruleId_fingerprint: { ruleId: rule.id, fingerprint: candidate.fingerprint } } })
    const now = new Date()
    const muted = Boolean(rule.mutedUntil && rule.mutedUntil > now)
    if (existing) {
      await this.prisma.alertEvent.update({ where: { id: existing.id }, data: { status: muted ? 'MUTED' : existing.status === 'RESOLVED' ? 'OPEN' : existing.status, severity: rule.severity, title: candidate.title, message: candidate.message, metadata: candidate.metadata as Prisma.InputJsonValue, lastSeenAt: now, ...(muted ? {} : { resolvedAt: null }) } })
      const shouldNotify = !muted && existing.status === 'RESOLVED' || (!muted && now.getTime() - existing.lastSeenAt.getTime() >= rule.cooldownMinutes * 60_000)
      if (shouldNotify) await this.notify(rule, { ...candidate, id: existing.id, severity: rule.severity })
      return shouldNotify
    }
    const created = await this.prisma.alertEvent.create({ data: { ruleId: rule.id, fingerprint: candidate.fingerprint, status: muted ? 'MUTED' : 'OPEN', severity: rule.severity, title: candidate.title, message: candidate.message, source: candidate.source, targetId: candidate.targetId, metadata: candidate.metadata as Prisma.InputJsonValue } })
    if (!muted) await this.notify(rule, { ...candidate, id: created.id, severity: rule.severity })
    return !muted
  }

  private async notify(rule: { id: string; key: string; name: string; severity: string; notifyInApp: boolean; notifyWebhook: boolean; webhookUrl: string; encryptedWebhookSecret: string }, event: Candidate & { id: string; severity: string }) {
    if (rule.notifyInApp) {
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' }, select: { id: true } })
      if (admins.length) await this.prisma.notification.createMany({ data: admins.map((admin) => ({ userId: admin.id, type: NotificationType.SYSTEM, title: event.title, body: event.message, metadata: { alertEventId: event.id, ruleKey: rule.key, severity: event.severity } as Prisma.InputJsonValue })) })
    }
    if (rule.notifyWebhook && rule.webhookUrl) {
      const payload = JSON.stringify({ eventId: event.id, rule: rule.key, severity: event.severity, title: event.title, message: event.message, source: event.source, targetId: event.targetId, metadata: event.metadata, occurredAt: new Date().toISOString() })
      const secret = rule.encryptedWebhookSecret ? this.crypto.decrypt(rule.encryptedWebhookSecret) : ''
      const signature = secret ? createHmac('sha256', secret).update(payload).digest('hex') : ''
      await fetch(rule.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Xinyue-Alert-Signature': signature } : {}) }, body: payload, signal: AbortSignal.timeout(10_000) }).catch(() => undefined)
    }
  }

  private assertWebhookUrl(value: string) {
    if (!value.trim()) return
    let url: URL
    try { url = new URL(value.trim()) } catch { throw new BadRequestException('Webhook 地址格式不正确') }
    if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Webhook 只支持 HTTP 或 HTTPS')
  }
}
