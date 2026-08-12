import { createHash } from 'node:crypto'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ModerationAction, ModerationEventStatus, ModerationRule, ModerationSource, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type ModerationContext = Record<string, string | number | boolean | null | undefined>

const actionWeight: Record<ModerationAction, number> = { LOG: 1, REVIEW: 2, BLOCK: 3 }

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  private async policy() {
    return this.prisma.moderationPolicy.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
  }

  private sourceEnabled(source: ModerationSource, policy: Awaited<ReturnType<ModerationService['policy']>>) {
    if (source === 'CHAT') return policy.scanChat
    if (source === 'IMAGE') return policy.scanImage
    if (source === 'COMMERCE') return policy.scanCommerce
    return true
  }

  private matches(rule: ModerationRule, content: string) {
    if (rule.type === 'REGEX') {
      try { return new RegExp(rule.pattern, rule.caseSensitive ? 'u' : 'iu').test(content) } catch { return false }
    }
    const subject = rule.caseSensitive ? content : content.toLocaleLowerCase()
    const pattern = rule.caseSensitive ? rule.pattern : rule.pattern.toLocaleLowerCase()
    return subject.includes(pattern)
  }

  async inspect(userId: string | null, source: ModerationSource, rawContent: string, context: ModerationContext = {}) {
    const content = rawContent.trim()
    if (!content) return { allowed: true, action: null, matches: [] }
    let policy: Awaited<ReturnType<ModerationService['policy']>>
    let rules: ModerationRule[]
    try {
      policy = await this.policy()
      if (!policy.enabled || !this.sourceEnabled(source, policy)) return { allowed: true, action: null, matches: [] }
      rules = await this.prisma.moderationRule.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    } catch (error) {
      const fallback = await this.prisma.moderationPolicy.findUnique({ where: { id: 'global' }, select: { failClosed: true } }).catch(() => null)
      if (fallback?.failClosed ?? true) throw new ServiceUnavailableException('内容安全服务暂时不可用，请稍后重试')
      return { allowed: true, action: null, matches: [], error }
    }
    const matched = rules.filter((rule) => this.matches(rule, content))
    if (!matched.length) return { allowed: true, action: null, matches: [] }
    const action = matched.reduce<ModerationAction>((current, rule) => actionWeight[rule.action] > actionWeight[current] ? rule.action : current, 'LOG')
    const excerptLength = Math.max(40, Math.min(policy.excerptLength, 1000))
    const event = await this.prisma.moderationEvent.create({ data: {
      userId,
      source,
      action,
      contentHash: createHash('sha256').update(content).digest('hex'),
      contentExcerpt: policy.retainContent ? content.slice(0, excerptLength) : `[内容已隐藏，原文 ${content.length} 个字符]`,
      matchedRules: matched.map((rule) => ({ id: rule.id, name: rule.name, category: rule.category, action: rule.action })) as Prisma.InputJsonValue,
      context: context as Prisma.InputJsonValue,
    } })
    if (action === 'BLOCK' || action === 'REVIEW') throw new ForbiddenException(action === 'REVIEW' ? '内容已提交安全审核，请修改后重试。' : policy.blockMessage)
    return { allowed: true, action, matches: matched.map((rule) => rule.id), eventId: event.id }
  }

  getPolicy() { return this.policy() }

  async updatePolicy(actorId: string, input: Prisma.ModerationPolicyUpdateInput) {
    const before = await this.policy()
    const after = await this.prisma.moderationPolicy.update({ where: { id: 'global' }, data: input })
    await this.audit(actorId, 'moderation.policy.update', 'moderation_policy', 'global', before, after)
    return after
  }

  listRules() { return this.prisma.moderationRule.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }) }

  private validateRule(input: { type?: string; pattern?: string }) {
    if (input.type === 'REGEX' && input.pattern) {
      try { new RegExp(input.pattern, 'iu') } catch { throw new BadRequestException('正则表达式格式无效') }
    }
  }

  async createRule(actorId: string, input: Prisma.ModerationRuleUncheckedCreateInput) {
    this.validateRule(input)
    const rule = await this.prisma.moderationRule.create({ data: input })
    await this.audit(actorId, 'moderation.rule.create', 'moderation_rule', rule.id, null, rule)
    return rule
  }

  async updateRule(actorId: string, id: string, input: Prisma.ModerationRuleUncheckedUpdateInput) {
    const before = await this.prisma.moderationRule.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('审核规则不存在')
    this.validateRule({ type: String(input.type || before.type), pattern: String(input.pattern || before.pattern) })
    const after = await this.prisma.moderationRule.update({ where: { id }, data: input })
    await this.audit(actorId, 'moderation.rule.update', 'moderation_rule', id, before, after)
    return after
  }

  async deleteRule(actorId: string, id: string) {
    const before = await this.prisma.moderationRule.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('审核规则不存在')
    await this.prisma.moderationRule.delete({ where: { id } })
    await this.audit(actorId, 'moderation.rule.delete', 'moderation_rule', id, before, null)
    return { deleted: true }
  }

  async listEvents(status?: ModerationEventStatus, source?: ModerationSource) {
    const [events, open, blockedToday] = await Promise.all([
      this.prisma.moderationEvent.findMany({ where: { status, source }, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { id: true, email: true, displayName: true } } } }),
      this.prisma.moderationEvent.count({ where: { status: 'OPEN' } }),
      this.prisma.moderationEvent.count({ where: { action: { in: ['BLOCK', 'REVIEW'] }, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ])
    return { events, summary: { open, blockedToday } }
  }

  async resolveEvent(actorId: string, id: string, status: ModerationEventStatus, resolutionNote = '') {
    if (status === 'OPEN') throw new BadRequestException('请选择已通过或已忽略')
    const before = await this.prisma.moderationEvent.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('审核事件不存在')
    const after = await this.prisma.moderationEvent.update({ where: { id }, data: { status, resolutionNote: resolutionNote.trim(), resolvedById: actorId, resolvedAt: new Date() } })
    await this.audit(actorId, 'moderation.event.resolve', 'moderation_event', id, { status: before.status }, { status: after.status, resolutionNote: after.resolutionNote })
    return after
  }

  private audit(actorId: string, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
    return this.prisma.auditLog.create({ data: {
      actorId, action, targetType, targetId,
      ...(before == null ? {} : { before: before as Prisma.InputJsonValue }),
      ...(after == null ? {} : { after: after as Prisma.InputJsonValue }),
    } })
  }
}
