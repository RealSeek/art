import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { AccountDeletionStatus, Prisma, UserRole } from '@prisma/client'
import { Queue } from 'bullmq'
import { AssetsService } from '../assets/assets.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'

const DELETION_COOLING_DAYS = 7

@Injectable()
export class AccountLifecycleService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly notifications: NotificationsService,
    @InjectQueue('commercial-lifecycle') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    const pending = await this.prisma.accountDeletionRequest.findMany({
      where: { status: AccountDeletionStatus.REQUESTED },
      select: { id: true, scheduledAt: true },
    })
    await Promise.allSettled(pending.map((item) => this.schedule(item.id, item.scheduledAt)))
    await this.queue.upsertJobScheduler('commercial-lifecycle-due-scan', { every: 15 * 60_000 }, {
      name: 'scan-deletions', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  current(userId: string) {
    return this.prisma.accountDeletionRequest.findFirst({
      where: { userId, status: { in: [AccountDeletionStatus.REQUESTED, AccountDeletionStatus.PROCESSING, AccountDeletionStatus.FAILED] } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async request(userId: string, reason = '') {
    const [user, existing, ownedTeams] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } }),
      this.current(userId),
      this.prisma.team.count({ where: { ownerId: userId } }),
    ])
    if (!user || user.status === 'DELETED') throw new NotFoundException('账户不存在')
    if (user.role !== UserRole.USER) throw new BadRequestException('管理员账户不能通过用户端注销')
    if (existing?.status === AccountDeletionStatus.PROCESSING) throw new BadRequestException('账户注销正在处理中')
    if (existing?.status === AccountDeletionStatus.REQUESTED) return existing
    if (ownedTeams) throw new BadRequestException('请先转让或解散名下团队，再申请注销账户')
    const scheduledAt = new Date(Date.now() + DELETION_COOLING_DAYS * 86_400_000)
    const created = await this.prisma.accountDeletionRequest.create({
      data: { userId, reason: reason.trim().slice(0, 2000), scheduledAt },
    })
    await this.schedule(created.id, scheduledAt)
    await this.notifications.sendCustomToUsers([userId], '账户注销申请已提交', `账户将在 ${scheduledAt.toLocaleString('zh-CN')} 后进入删除流程。冷静期内可随时撤销。`)
    return created
  }

  async cancel(userId: string) {
    const request = await this.prisma.accountDeletionRequest.findFirst({
      where: { userId, status: AccountDeletionStatus.REQUESTED }, orderBy: { createdAt: 'desc' },
    })
    if (!request) throw new NotFoundException('没有可撤销的账户注销申请')
    const result = await this.prisma.accountDeletionRequest.update({
      where: { id: request.id }, data: { status: AccountDeletionStatus.CANCELLED, cancelledAt: new Date() },
    })
    await this.queue.remove(this.jobId(request.id)).catch(() => undefined)
    return result
  }

  list(status?: AccountDeletionStatus) {
    return this.prisma.accountDeletionRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' }, take: 500,
      include: { user: { select: { id: true, email: true, username: true, displayName: true, status: true, createdAt: true } } },
    })
  }

  async process(id: string, force = false) {
    const request = await this.prisma.accountDeletionRequest.findUnique({
      where: { id }, include: { user: { select: { id: true, email: true, role: true, status: true } } },
    })
    if (!request) throw new NotFoundException('账户注销申请不存在')
    if (request.status === AccountDeletionStatus.COMPLETED) return request
    if (request.status !== AccountDeletionStatus.REQUESTED && request.status !== AccountDeletionStatus.FAILED) throw new BadRequestException('当前注销状态不能处理')
    if (!force && request.scheduledAt > new Date()) throw new BadRequestException('账户仍处于冷静期')
    if (request.user.role !== UserRole.USER) throw new BadRequestException('管理员账户不能执行自动注销')
    if (await this.prisma.team.count({ where: { ownerId: request.userId } })) throw new BadRequestException('用户仍是团队所有者，需先转让团队')

    const locked = await this.prisma.accountDeletionRequest.updateMany({
      where: { id, status: { in: [AccountDeletionStatus.REQUESTED, AccountDeletionStatus.FAILED] } },
      data: { status: AccountDeletionStatus.PROCESSING, processingAt: new Date(), failureReason: '' },
    })
    if (!locked.count) throw new BadRequestException('注销申请已由其他任务处理')

    try {
      await this.assets.purgePersonalAssets(request.userId)
      await this.prisma.$transaction(async (tx) => {
        await tx.session.deleteMany({ where: { userId: request.userId } })
        await tx.externalIdentity.deleteMany({ where: { userId: request.userId } })
        await tx.userApiCredential.deleteMany({ where: { userId: request.userId } })
        await tx.connectorCredential.deleteMany({ where: { userId: request.userId } })
        await tx.agentSchedule.deleteMany({ where: { userId: request.userId } })
        await tx.agentTask.deleteMany({ where: { userId: request.userId, project: { teamId: null } } })
        await tx.conversation.deleteMany({ where: { userId: request.userId, OR: [{ projectId: null }, { project: { teamId: null } }] } })
        await tx.knowledgeBase.deleteMany({ where: { creatorId: request.userId, teamId: null } })
        await tx.project.deleteMany({ where: { userId: request.userId, teamId: null } })
        await tx.asset.deleteMany({ where: { userId: request.userId, teamId: null } })
        await tx.pluginInstallation.deleteMany({ where: { userId: request.userId } })
        await tx.userModel.deleteMany({ where: { userId: request.userId } })
        await tx.userSettings.deleteMany({ where: { userId: request.userId } })
        await tx.user.update({ where: { id: request.userId }, data: {
          email: null, username: null, displayName: '已注销用户', avatarUrl: null, passwordHash: null,
          company: '', phone: '', tags: [], adminNote: '', status: 'DELETED', emailVerifiedAt: null,
        } })
        await tx.accountDeletionRequest.update({ where: { id }, data: {
          status: AccountDeletionStatus.COMPLETED, completedAt: new Date(), failureReason: '',
          retentionNotes: '支付、退款、发票、额度流水及审计记录按合规要求保留；身份信息已匿名化。',
        } })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      if (request.user.email) await this.prisma.otpCode.deleteMany({ where: { email: request.user.email } })
      return this.prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id } })
    } catch (error) {
      const message = error instanceof Error ? error.message : '账户注销处理失败'
      await this.prisma.accountDeletionRequest.update({ where: { id }, data: { status: AccountDeletionStatus.FAILED, failureReason: message.slice(0, 2000) } })
      throw error
    }
  }

  async processDue() {
    const due = await this.prisma.accountDeletionRequest.findMany({
      where: { status: { in: [AccountDeletionStatus.REQUESTED, AccountDeletionStatus.FAILED] }, scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' }, take: 50, select: { id: true },
    })
    const results = await Promise.allSettled(due.map((item) => this.process(item.id)))
    return { attempted: due.length, completed: results.filter((item) => item.status === 'fulfilled').length }
  }

  private schedule(id: string, scheduledAt: Date) {
    return this.queue.add('delete-account', { requestId: id }, {
      jobId: this.jobId(id), delay: Math.max(0, scheduledAt.getTime() - Date.now()), attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: 100, removeOnFail: 500,
    })
  }

  private jobId(id: string) { return `account-deletion-${id}` }
}
