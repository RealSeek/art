import { createHash } from 'node:crypto'
import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ModerationAction, ModerationAppealStatus, ModerationEventStatus, ModerationRule, ModerationSource, NotificationType, Prisma } from '@prisma/client'
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
    if (action === 'BLOCK' || action === 'REVIEW') {
      throw new ForbiddenException({
        code: action === 'REVIEW' ? 'CONTENT_REVIEW_REQUIRED' : 'CONTENT_BLOCKED',
        message: action === 'REVIEW' ? '内容已提交安全审核，请修改后重试。' : policy.blockMessage,
        moderationEventId: event.id,
        appealAllowed: true,
      })
    }
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
      this.prisma.moderationEvent.findMany({ where: { status, source }, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { id: true, email: true, displayName: true } }, appeal: { include: { history: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, displayName: true } } } } } } } }),
      this.prisma.moderationEvent.count({ where: { status: 'OPEN' } }),
      this.prisma.moderationEvent.count({ where: { action: { in: ['BLOCK', 'REVIEW'] }, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ])
    return { events, summary: { open, blockedToday } }
  }

  async resolveEvent(actorId: string, id: string, status: ModerationEventStatus, resolutionNote = '') {
    if (status === 'OPEN') throw new BadRequestException('请选择已通过或已忽略')
    const before = await this.prisma.moderationEvent.findUnique({ where: { id }, include: { appeal: true } })
    if (!before) throw new NotFoundException('审核事件不存在')
    if (before.appeal && ['PENDING', 'IN_REVIEW'].includes(before.appeal.status)) throw new BadRequestException('该事件存在待处理申诉，请通过申诉复核入口处置')
    const after = await this.prisma.moderationEvent.update({ where: { id }, data: { status, resolutionNote: resolutionNote.trim(), resolvedById: actorId, resolvedAt: new Date() } })
    await this.audit(actorId, 'moderation.event.resolve', 'moderation_event', id, { status: before.status }, { status: after.status, resolutionNote: after.resolutionNote })
    return after
  }

  async listUserCases(userId: string) {
    return this.prisma.moderationEvent.findMany({
      where: { userId, action: { in: ['BLOCK', 'REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        source: true,
        action: true,
        status: true,
        contentExcerpt: true,
        createdAt: true,
        appeal: {
          select: {
            id: true,
            status: true,
            reason: true,
            reviewNote: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
            history: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true, note: true, createdAt: true } },
          },
        },
      },
    })
  }

  async createAppeal(userId: string, eventId: string, reasonInput: string) {
    const reason = reasonInput.trim()
    const event = await this.prisma.moderationEvent.findFirst({ where: { id: eventId, userId }, include: { appeal: true } })
    if (!event || !['BLOCK', 'REVIEW'].includes(event.action)) throw new NotFoundException('审核事件不存在或不可申诉')
    if (event.status !== 'OPEN') throw new BadRequestException('该审核事件已经处置')
    if (event.appeal) throw new BadRequestException('该审核事件已经提交过申诉')
    const recent = await this.prisma.moderationAppeal.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } })
    if (recent >= 5) throw new HttpException('24 小时内最多提交 5 次审核申诉', HttpStatus.TOO_MANY_REQUESTS)
    return this.prisma.$transaction(async (tx) => {
      const appeal = await tx.moderationAppeal.create({
        data: { eventId, userId, reason, history: { create: { actorId: userId, status: 'PENDING', note: '用户提交申诉' } } },
        include: { history: { orderBy: { createdAt: 'asc' } } },
      })
      await tx.auditLog.create({ data: { actorId: userId, action: 'moderation.appeal.create', targetType: 'moderation_appeal', targetId: appeal.id, after: { eventId, reasonLength: reason.length } } })
      return appeal
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('该审核事件已经提交过申诉')
      throw error
    })
  }

  async cancelAppeal(userId: string, appealId: string) {
    return this.prisma.$transaction(async (tx) => {
      const appeal = await tx.moderationAppeal.findFirst({ where: { id: appealId, userId } })
      if (!appeal) throw new NotFoundException('申诉不存在')
      if (appeal.status !== 'PENDING') throw new BadRequestException('只有待处理申诉可以撤回')
      const updated = await tx.moderationAppeal.update({ where: { id: appealId }, data: { status: 'CANCELLED' } })
      await tx.moderationAppealHistory.create({ data: { appealId, actorId: userId, status: 'CANCELLED', note: '用户撤回申诉' } })
      await tx.auditLog.create({ data: { actorId: userId, action: 'moderation.appeal.cancel', targetType: 'moderation_appeal', targetId: appealId, before: { status: appeal.status }, after: { status: updated.status } } })
      return updated
    })
  }

  async reviewAppeal(actorId: string, eventId: string, status: ModerationAppealStatus, noteInput = '') {
    if (!['IN_REVIEW', 'APPROVED', 'REJECTED'].includes(status)) throw new BadRequestException('无效的申诉处置状态')
    const note = noteInput.trim()
    if (['APPROVED', 'REJECTED'].includes(status) && !note) throw new BadRequestException('完成复核时必须填写处置说明')
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.moderationEvent.findUnique({ where: { id: eventId }, include: { appeal: true } })
      if (!event?.appeal) throw new NotFoundException('该事件没有申诉')
      if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(event.appeal.status)) throw new BadRequestException('该申诉已经结束')
      const now = new Date()
      const appeal = await tx.moderationAppeal.update({
        where: { id: event.appeal.id },
        data: {
          status,
          reviewNote: note || event.appeal.reviewNote,
          reviewedById: actorId,
          reviewedAt: status === 'IN_REVIEW' ? null : now,
        },
      })
      await tx.moderationAppealHistory.create({ data: { appealId: appeal.id, actorId, status, note } })
      if (status !== 'IN_REVIEW') {
        const eventStatus: ModerationEventStatus = status === 'APPROVED' ? 'APPROVED' : 'DISMISSED'
        await tx.moderationEvent.update({ where: { id: eventId }, data: { status: eventStatus, resolutionNote: note, resolvedById: actorId, resolvedAt: now } })
        await tx.notification.create({ data: {
          userId: appeal.userId,
          type: NotificationType.SYSTEM,
          title: status === 'APPROVED' ? '内容审核申诉已通过' : '内容审核申诉未通过',
          body: note,
          metadata: { appealId: appeal.id, eventId, status } as Prisma.InputJsonValue,
        } })
      }
      await tx.auditLog.create({ data: { actorId, action: 'moderation.appeal.review', targetType: 'moderation_appeal', targetId: appeal.id, before: { status: event.appeal.status }, after: { status, note } } })
      return appeal
    })
  }

  private audit(actorId: string, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
    return this.prisma.auditLog.create({ data: {
      actorId, action, targetType, targetId,
      ...(before == null ? {} : { before: before as Prisma.InputJsonValue }),
      ...(after == null ? {} : { after: after as Prisma.InputJsonValue }),
    } })
  }
}
