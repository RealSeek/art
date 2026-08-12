import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AgentTaskStatus, Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { AgentTasksService } from './agent-tasks.service'

@Controller('admin/agent')
@UseGuards(AuthGuard, AdminGuard)
export class AdminAgentTasksController {
  constructor(private readonly prisma: PrismaService, private readonly tasks: AgentTasksService) {}

  @Get('overview')
  async overview() {
    const since = new Date(Date.now() - 24 * 60 * 60_000)
    const [total, active, waitingApproval, failed24h, succeeded24h, schedules, toolCalls24h, duration] = await Promise.all([
      this.prisma.agentTask.count(),
      this.prisma.agentTask.count({ where: { status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING] } } }),
      this.prisma.agentTask.count({ where: { status: AgentTaskStatus.WAITING_APPROVAL } }),
      this.prisma.agentTask.count({ where: { status: AgentTaskStatus.FAILED, completedAt: { gte: since } } }),
      this.prisma.agentTask.count({ where: { status: AgentTaskStatus.SUCCEEDED, completedAt: { gte: since } } }),
      this.prisma.agentSchedule.count({ where: { enabled: true } }),
      this.prisma.agentToolCall.count({ where: { createdAt: { gte: since } } }),
      this.prisma.$queryRaw<Array<{ average: number | null }>>`SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) * 1000)::float AS average FROM "AgentRun" WHERE "status" = 'SUCCEEDED' AND "completedAt" >= ${since}`,
    ])
    return { total, active, waitingApproval, failed24h, succeeded24h, schedules, toolCalls24h, averageDurationMs: Math.round(duration[0]?.average || 0), successRate24h: succeeded24h + failed24h ? Math.round(succeeded24h * 10000 / (succeeded24h + failed24h)) / 100 : 0 }
  }

  @Get('tasks')
  async list(@Query('page') rawPage?: string, @Query('pageSize') rawPageSize?: string, @Query('status') status?: string, @Query('query') query?: string) {
    const page = Math.max(1, Number(rawPage) || 1)
    const pageSize = Math.min(100, Math.max(10, Number(rawPageSize) || 20))
    const statuses = Object.values(AgentTaskStatus) as string[]
    const where: Prisma.AgentTaskWhereInput = {
      ...(status && statuses.includes(status) ? { status: status as AgentTaskStatus } : {}),
      ...(query?.trim() ? { OR: [{ title: { contains: query.trim(), mode: 'insensitive' } }, { goal: { contains: query.trim(), mode: 'insensitive' } }, { user: { displayName: { contains: query.trim(), mode: 'insensitive' } } }, { user: { email: { contains: query.trim(), mode: 'insensitive' } } }] } : {}),
    }
    const [items, total] = await Promise.all([
      this.prisma.agentTask.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { id: true, displayName: true, email: true } }, assistant: { select: { name: true } }, project: { select: { name: true } }, schedule: { select: { id: true, title: true } }, runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, iteration: true, maxIterations: true, currentNode: true, startedAt: true, completedAt: true } }, _count: { select: { runs: true, toolCalls: true, events: true } } } }),
      this.prisma.agentTask.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  @Get('tasks/:id')
  async detail(@Param('id') id: string) {
    const task = await this.prisma.agentTask.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        assistant: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        schedule: true,
        steps: { orderBy: { position: 'asc' } },
        runs: { orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'asc' } }, toolCalls: { orderBy: [{ iteration: 'asc' }, { position: 'asc' }] } } },
      },
    })
    if (!task) throw new BadRequestException('Agent 任务不存在')
    return task
  }

  @Get('schedules')
  schedules() { return this.prisma.agentSchedule.findMany({ orderBy: { updatedAt: 'desc' }, include: { user: { select: { displayName: true, email: true } }, _count: { select: { tasks: true } } } }) }

  @Get('tool-calls')
  toolCalls(@Query('status') status?: string) { return this.prisma.agentToolCall.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 500, include: { agentTask: { select: { id: true, title: true, user: { select: { displayName: true, email: true } } } }, tool: { select: { name: true, key: true } }, run: { select: { iteration: true } } } }) }

  @Post('tasks/:id/cancel')
  async cancel(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const task = await this.owner(id)
    const result = await this.tasks.cancel(task.userId, id)
    await this.audit(admin.id, request, 'agent.cancel', id, { status: result.status })
    return result
  }

  @Post('tasks/:id/retry')
  async retry(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const task = await this.owner(id)
    const result = await this.tasks.retry(task.userId, id)
    await this.audit(admin.id, request, 'agent.retry', id, { status: result.status })
    return result
  }

  @Post('tasks/:id/tool-calls/:callId/review')
  async review(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Param('callId') callId: string, @Body('decision') decision: 'APPROVED' | 'REJECTED') {
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new BadRequestException('审批决定无效')
    const task = await this.owner(id)
    const result = await this.tasks.reviewToolCall(task.userId, id, callId, decision)
    await this.audit(admin.id, request, `agent.tool.${decision.toLowerCase()}`, callId, { taskId: id })
    return result
  }

  private async owner(id: string) {
    const task = await this.prisma.agentTask.findUnique({ where: { id }, select: { userId: true } })
    if (!task) throw new BadRequestException('Agent 任务不存在')
    return task
  }

  private audit(actorId: string, request: FastifyRequest, action: string, targetId: string, after: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { actorId, action, targetType: 'agent-task', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } })
  }
}
