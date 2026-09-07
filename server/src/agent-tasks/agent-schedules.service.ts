import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { AgentSchedule, Prisma } from '@prisma/client'
import { Job, Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'
import { AgentTasksService, CreateAgentTaskInput } from './agent-tasks.service'

export type AgentScheduleInput = CreateAgentTaskInput & {
  cronExpression: string
  timezone?: string
  enabled?: boolean
}

@Injectable()
export class AgentSchedulesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: AgentTasksService,
    @InjectQueue('agent-task') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    const schedules = await this.prisma.agentSchedule.findMany({ where: { enabled: true }, select: { id: true, cronExpression: true, timezone: true } })
    await Promise.allSettled(schedules.map((schedule) => this.upsertScheduler(schedule)))
  }

  list(userId: string) {
    return this.prisma.agentSchedule.findMany({
      where: { userId }, orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { tasks: true } }, tasks: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, completedAt: true, errorMessage: true } } },
    })
  }

  async create(userId: string, input: AgentScheduleInput) {
    this.validate(input)
    await this.tasks.validateInput(userId, input)
    const schedule = await this.prisma.agentSchedule.create({ data: this.data(userId, input) })
    try {
      if (schedule.enabled) await this.upsertScheduler(schedule)
      return this.get(userId, schedule.id)
    } catch (error) {
      await this.prisma.agentSchedule.delete({ where: { id: schedule.id } })
      throw new BadRequestException(error instanceof Error ? `定时规则无效：${error.message}` : '定时规则无效')
    }
  }

  async get(userId: string, id: string) {
    const schedule = await this.prisma.agentSchedule.findFirst({
      where: { id, userId }, include: { _count: { select: { tasks: true } }, tasks: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, title: true, status: true, scheduledFor: true, completedAt: true, errorMessage: true } } },
    })
    if (!schedule) throw new NotFoundException('定时任务不存在')
    return schedule
  }

  async update(userId: string, id: string, input: Partial<AgentScheduleInput>) {
    const current = await this.prisma.agentSchedule.findFirst({ where: { id, userId } })
    if (!current) throw new NotFoundException('定时任务不存在')
    const merged: AgentScheduleInput = {
      title: input.title ?? current.title, goal: input.goal ?? current.goal, instructions: input.instructions ?? current.instructions,
      model: input.model ?? current.model, skillId: input.skillId ?? current.skillId, assistantId: input.assistantId === undefined ? current.assistantId || undefined : input.assistantId,
      projectId: input.projectId === undefined ? current.projectId || undefined : input.projectId, pluginId: input.pluginId === undefined ? current.pluginId || undefined : input.pluginId,
      attachmentIds: input.attachmentIds ?? this.stringArray(current.attachmentIds), cronExpression: input.cronExpression ?? current.cronExpression,
      timezone: input.timezone ?? current.timezone, enabled: input.enabled ?? current.enabled,
    }
    this.validate(merged)
    await this.tasks.validateInput(userId, merged)
    const { userId: _userId, ...updateData } = this.data(userId, merged)
    const schedule = await this.prisma.agentSchedule.update({ where: { id }, data: updateData })
    try {
      if (schedule.enabled) await this.upsertScheduler(schedule)
      else await this.queue.removeJobScheduler(this.schedulerKey(id))
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? `定时规则无效：${error.message}` : '定时规则无效')
    }
    return this.get(userId, id)
  }

  async remove(userId: string, id: string) {
    const current = await this.prisma.agentSchedule.findFirst({ where: { id, userId }, select: { id: true } })
    if (!current) throw new NotFoundException('定时任务不存在')
    await this.queue.removeJobScheduler(this.schedulerKey(id))
    await this.prisma.agentSchedule.delete({ where: { id } })
    return { deleted: true }
  }

  async runNow(userId: string, id: string) {
    const schedule = await this.prisma.agentSchedule.findFirst({ where: { id, userId } })
    if (!schedule) throw new NotFoundException('定时任务不存在')
    return this.createExecution(schedule, new Date())
  }

  async trigger(job: Job) {
    const scheduleId = String(job.data?.scheduleId || '')
    const schedule = await this.prisma.agentSchedule.findFirst({ where: { id: scheduleId, enabled: true } })
    if (!schedule) return
    const tail = Number(String(job.id || '').split(':').pop())
    const scheduledFor = new Date(Number.isFinite(tail) && tail > 0 ? tail : job.timestamp)
    try {
      await this.createExecution(schedule, scheduledFor)
      await this.refreshNextRun(schedule.id)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
      await this.prisma.agentSchedule.update({ where: { id: schedule.id }, data: { consecutiveFailures: { increment: 1 }, lastError: error instanceof Error ? error.message : '定时任务启动失败', lastRunAt: new Date() } })
      throw error
    }
  }

  private async createExecution(schedule: AgentSchedule, scheduledFor: Date) {
    const task = await this.tasks.create(schedule.userId, {
      title: schedule.title, goal: schedule.goal, instructions: schedule.instructions, model: schedule.model, skillId: schedule.skillId,
      assistantId: schedule.assistantId || undefined, projectId: schedule.projectId || undefined, pluginId: schedule.pluginId || undefined,
      attachmentIds: this.stringArray(schedule.attachmentIds), scheduleId: schedule.id, scheduledFor,
    })
    await this.prisma.agentSchedule.update({ where: { id: schedule.id }, data: { lastTaskId: task.id, lastRunAt: new Date(), consecutiveFailures: 0, lastError: '' } })
    return this.tasks.run(schedule.userId, task.id)
  }

  private async upsertScheduler(schedule: { id: string; cronExpression: string; timezone: string }) {
    const job = await this.queue.upsertJobScheduler(this.schedulerKey(schedule.id), { pattern: schedule.cronExpression, tz: schedule.timezone }, { name: 'scheduled', data: { scheduleId: schedule.id }, opts: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 } })
    await this.prisma.agentSchedule.update({ where: { id: schedule.id }, data: { nextRunAt: new Date(job.timestamp + Math.max(0, job.delay || 0)) } })
  }

  private async refreshNextRun(id: string) {
    const scheduler = await this.queue.getJobScheduler(this.schedulerKey(id))
    await this.prisma.agentSchedule.update({ where: { id }, data: { nextRunAt: scheduler?.next ? new Date(scheduler.next) : null } })
  }

  private schedulerKey(id: string) { return `agent-schedule:${id}` }

  private validate(input: AgentScheduleInput) {
    if (!input.title?.trim() || !input.goal?.trim() || !input.model?.trim()) throw new BadRequestException('任务名称、目标和模型不能为空')
    if (!/^\s*\S+(\s+\S+){4,6}\s*$/.test(input.cronExpression || '')) throw new BadRequestException('Cron 表达式应包含 5 到 7 个字段')
    try { new Intl.DateTimeFormat('zh-CN', { timeZone: input.timezone || 'Asia/Shanghai' }).format() } catch { throw new BadRequestException('时区无效') }
  }

  private data(userId: string, input: AgentScheduleInput) {
    return {
      userId, title: input.title.trim(), goal: input.goal.trim(), instructions: input.instructions?.trim() || '', model: input.model.trim(), skillId: input.skillId?.trim() || 'daily',
      assistantId: input.assistantId || null, projectId: input.projectId || null, pluginId: input.pluginId || null,
      attachmentIds: (input.attachmentIds || []) as Prisma.InputJsonValue, cronExpression: input.cronExpression.trim(), timezone: input.timezone || 'Asia/Shanghai', enabled: input.enabled ?? true,
    }
  }

  private stringArray(value: Prisma.JsonValue | null): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
}
