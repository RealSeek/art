import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ModerationSource, NotificationType, Prisma, SupportTicketPriority, SupportTicketStatus } from '@prisma/client'
import { ModerationService } from '../moderation/moderation.service'
import { PrismaService } from '../prisma/prisma.service'

type TicketMessageInput = { body: string; assetIds?: string[] }

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService, private readonly moderation: ModerationService) {}

  private async assertAssets(userId: string, assetIds: string[] = []) {
    const unique = [...new Set(assetIds)]
    if (!unique.length) return unique
    const count = await this.prisma.asset.count({ where: { id: { in: unique }, userId, deletedAt: null } })
    if (count !== unique.length) throw new NotFoundException('工单附件不存在')
    return unique
  }

  private async hydrateMessages<T extends { assetIds: string[] }>(messages: T[], admin = false) {
    const ids = [...new Set(messages.flatMap((message) => message.assetIds))]
    const assets = ids.length ? await this.prisma.asset.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true, mimeType: true, size: true } }) : []
    const assetMap = new Map(assets.map((asset) => [asset.id, { ...asset, size: Number(asset.size), contentUrl: `/v1/${admin ? 'admin/' : ''}assets/${asset.id}/content` }]))
    return messages.map((message) => ({ ...message, attachments: message.assetIds.map((id) => assetMap.get(id)).filter(Boolean) }))
  }

  async listForUser(userId: string) {
    const tickets = await this.prisma.supportTicket.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 100, include: { assignedTo: { select: { id: true, displayName: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, body: true, authorType: true, createdAt: true } }, _count: { select: { messages: true } } } })
    return tickets.map((ticket) => ({ ...ticket, hasUnread: Boolean(ticket.lastAdminMessageAt && (!ticket.userLastReadAt || ticket.lastAdminMessageAt > ticket.userLastReadAt)) }))
  }

  async unreadForUser(userId: string) {
    const tickets = await this.prisma.supportTicket.findMany({ where: { userId, lastAdminMessageAt: { not: null } }, select: { lastAdminMessageAt: true, userLastReadAt: true } })
    return { unread: tickets.filter((ticket) => ticket.lastAdminMessageAt && (!ticket.userLastReadAt || ticket.lastAdminMessageAt > ticket.userLastReadAt)).length }
  }

  async create(userId: string, input: { subject: string; category?: string } & TicketMessageInput) {
    await this.moderation.inspect(userId, ModerationSource.SUPPORT, `${input.subject}\n${input.body}`, { entry: 'support-ticket' })
    const assetIds = await this.assertAssets(userId, input.assetIds)
    const now = new Date()
    return this.prisma.$transaction(async (tx) => tx.supportTicket.create({ data: {
      userId,
      subject: input.subject.trim(),
      category: input.category?.trim() || '其他',
      lastUserMessageAt: now,
      userLastReadAt: now,
      messages: { create: { authorType: 'USER', authorId: userId, body: input.body.trim(), assetIds } },
    }, include: { messages: true } }))
  }

  async detailForUser(userId: string, id: string) {
    const exists = await this.prisma.supportTicket.findFirst({ where: { id, userId }, select: { id: true } })
    if (!exists) throw new NotFoundException('工单不存在')
    await this.prisma.supportTicket.update({ where: { id }, data: { userLastReadAt: new Date() } })
    const ticket = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id }, include: { assignedTo: { select: { id: true, displayName: true } }, messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { author: { select: { id: true, displayName: true, role: true } } } } } })
    return { ...ticket, messages: await this.hydrateMessages(ticket.messages) }
  }

  async replyForUser(userId: string, id: string, input: TicketMessageInput) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, userId } })
    if (!ticket) throw new NotFoundException('工单不存在')
    if (ticket.status === 'CLOSED') throw new BadRequestException('工单已关闭，无法继续回复')
    await this.moderation.inspect(userId, ModerationSource.SUPPORT, input.body, { ticketId: id, entry: 'support-reply' })
    const assetIds = await this.assertAssets(userId, input.assetIds)
    const now = new Date()
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({ data: { ticketId: id, authorType: 'USER', authorId: userId, body: input.body.trim(), assetIds } })
      await tx.supportTicket.update({ where: { id }, data: { status: 'OPEN', lastUserMessageAt: now, userLastReadAt: now, resolvedAt: null, closedAt: null } })
      return created
    })
    return message
  }

  async closeForUser(userId: string, id: string) {
    const result = await this.prisma.supportTicket.updateMany({ where: { id, userId, status: { not: 'CLOSED' } }, data: { status: 'CLOSED', closedAt: new Date(), userLastReadAt: new Date() } })
    if (!result.count) throw new NotFoundException('工单不存在或已关闭')
    return { closed: true }
  }

  async adminSummary() {
    const [open, urgent, waiting, unassigned] = await Promise.all([
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.supportTicket.count({ where: { priority: 'URGENT', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.supportTicket.count({ where: { status: 'WAITING_USER' } }),
      this.prisma.supportTicket.count({ where: { assignedToId: null, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    ])
    return { open, urgent, waiting, unassigned }
  }

  async listForAdmin(actorId: string, filter: { status?: SupportTicketStatus; priority?: SupportTicketPriority; query?: string; assigned?: string }) {
    const tickets = await this.prisma.supportTicket.findMany({ where: {
      status: filter.status,
      priority: filter.priority,
      assignedToId: filter.assigned === 'me' ? actorId : filter.assigned === 'unassigned' ? null : filter.assigned || undefined,
      ...(filter.query ? { OR: [{ subject: { contains: filter.query, mode: 'insensitive' } }, { user: { is: { OR: [{ email: { contains: filter.query, mode: 'insensitive' } }, { displayName: { contains: filter.query, mode: 'insensitive' } }] } } }] } : {}),
    }, orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }], take: 200, include: { user: { select: { id: true, email: true, displayName: true, status: true } }, assignedTo: { select: { id: true, displayName: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, body: true, authorType: true, createdAt: true } }, _count: { select: { messages: true } } } })
    return tickets.map((ticket) => ({ ...ticket, hasUnread: Boolean(ticket.lastUserMessageAt && (!ticket.adminLastReadAt || ticket.lastUserMessageAt > ticket.adminLastReadAt)) }))
  }

  listAgents() {
    return this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
      orderBy: [{ role: 'desc' }, { displayName: 'asc' }],
      select: { id: true, displayName: true, email: true, role: true, _count: { select: { assignedTickets: true } } },
    })
  }

  async detailForAdmin(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, displayName: true, company: true, phone: true, status: true } }, assignedTo: { select: { id: true, displayName: true, email: true } }, messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { author: { select: { id: true, displayName: true, role: true } } } } } })
    if (!ticket) throw new NotFoundException('工单不存在')
    await this.prisma.supportTicket.update({ where: { id }, data: { adminLastReadAt: new Date() } })
    return { ...ticket, messages: await this.hydrateMessages(ticket.messages, true) }
  }

  async replyForAdmin(actorId: string, id: string, input: TicketMessageInput) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } })
    if (!ticket) throw new NotFoundException('工单不存在')
    if (ticket.status === 'CLOSED') throw new BadRequestException('工单已关闭，请先重新打开')
    const assetIds = await this.assertAssets(actorId, input.assetIds)
    const now = new Date()
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({ data: { ticketId: id, authorType: 'ADMIN', authorId: actorId, body: input.body.trim(), assetIds } })
      await tx.supportTicket.update({ where: { id }, data: { status: 'WAITING_USER', assignedToId: ticket.assignedToId || actorId, lastAdminMessageAt: now, adminLastReadAt: now } })
      await tx.notification.create({ data: { userId: ticket.userId, type: NotificationType.SUPPORT, title: `工单回复：${ticket.subject}`, body: input.body.trim().slice(0, 300), metadata: { ticketId: id } as Prisma.InputJsonValue } })
      return created
    })
    await this.audit(actorId, 'support.ticket.reply', id, { status: ticket.status }, { status: 'WAITING_USER', messageId: message.id })
    return message
  }

  async updateForAdmin(actorId: string, id: string, input: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedToId?: string | null }) {
    const before = await this.prisma.supportTicket.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('工单不存在')
    if (input.assignedToId) {
      const admin = await this.prisma.user.findFirst({ where: { id: input.assignedToId, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' }, select: { id: true } })
      if (!admin) throw new ForbiddenException('负责人不是有效管理员')
    }
    const now = new Date()
    const after = await this.prisma.supportTicket.update({ where: { id }, data: {
      status: input.status,
      priority: input.priority,
      assignedToId: input.assignedToId,
      ...(input.status === 'RESOLVED' ? { resolvedAt: now, closedAt: null } : {}),
      ...(input.status === 'CLOSED' ? { closedAt: now } : {}),
      ...(input.status && !['RESOLVED', 'CLOSED'].includes(input.status) ? { resolvedAt: null, closedAt: null } : {}),
    } })
    if (input.status && input.status !== before.status) await this.prisma.notification.create({ data: { userId: before.userId, type: NotificationType.SUPPORT, title: `工单状态更新：${before.subject}`, body: `工单状态已更新为 ${input.status}`, metadata: { ticketId: id, status: input.status } as Prisma.InputJsonValue } })
    await this.audit(actorId, 'support.ticket.update', id, { status: before.status, priority: before.priority, assignedToId: before.assignedToId }, { status: after.status, priority: after.priority, assignedToId: after.assignedToId })
    return after
  }

  private audit(actorId: string, action: string, targetId: string, before: unknown, after: unknown) {
    return this.prisma.auditLog.create({ data: { actorId, action, targetType: 'support_ticket', targetId, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue } })
  }
}
