import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { AgentTaskStatus, AgentTaskStepStatus, JobKind, Prisma } from '@prisma/client'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { Job } from 'bullmq'
import { GenerationsService } from '../generations/generations.service'
import { PrismaService } from '../prisma/prisma.service'

const AgentState = Annotation.Root({
  taskId: Annotation<string>(),
  runKey: Annotation<string>(),
  conversationId: Annotation<string>(),
  generationJobId: Annotation<string>(),
  answer: Annotation<string>(),
})

class AgentTaskCancelledError extends Error {}

@Injectable()
@Processor('agent-task', { concurrency: 8 })
export class AgentTasksProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService, private readonly generations: GenerationsService) { super() }

  async process(job: Job<{ taskId: string; runKey: string }>) {
    const { taskId, runKey } = job.data
    const started = await this.prisma.agentTask.updateMany({ where: { id: taskId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING] } }, data: { status: AgentTaskStatus.RUNNING, startedAt: new Date() } })
    if (!started.count) return
    try {
      const graph = new StateGraph(AgentState)
        .addNode('prepare', (state) => this.prepare(state.taskId))
        .addNode('plan', (state) => this.plan(state.taskId))
        .addNode('execute', (state) => this.execute(state.taskId, state.runKey, state.conversationId))
        .addNode('verify', (state) => this.verify(state.taskId, state.generationJobId))
        .addNode('deliver', (state) => this.deliver(state.taskId, state.answer))
        .addEdge(START, 'prepare')
        .addEdge('prepare', 'plan')
        .addEdge('plan', 'execute')
        .addEdge('execute', 'verify')
        .addEdge('verify', 'deliver')
        .addEdge('deliver', END)
        .compile()
      return await graph.invoke({ taskId, runKey, conversationId: '', generationJobId: '', answer: '' })
    } catch (error) {
      const current = await this.prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } })
      if (current?.status === AgentTaskStatus.CANCELLED || error instanceof AgentTaskCancelledError) return
      const message = error instanceof Error ? error.message : 'Agent 任务执行失败'
      const now = new Date()
      await this.prisma.$transaction([
        this.prisma.agentTask.updateMany({ where: { id: taskId, status: { in: [AgentTaskStatus.QUEUED, AgentTaskStatus.RUNNING] } }, data: { status: AgentTaskStatus.FAILED, errorMessage: message, completedAt: now } }),
        this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, status: AgentTaskStepStatus.RUNNING }, data: { status: AgentTaskStepStatus.FAILED, detail: message, completedAt: now } }),
        this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, status: AgentTaskStepStatus.PENDING }, data: { status: AgentTaskStepStatus.CANCELLED, completedAt: now } }),
      ])
      throw error
    }
  }

  private async prepare(taskId: string) {
    await this.startStep(taskId, 0, '正在校验模型、附件与任务上下文')
    await this.assertActive(taskId)
    const task = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
    if (task.conversationId) {
      await this.completeStep(taskId, 0, '已恢复此前准备的任务上下文')
      return { conversationId: task.conversationId }
    }
    const attachmentIds = this.attachmentIds(task.attachmentIds)
    const conversation = await this.prisma.conversation.create({
      data: { userId: task.userId, projectId: task.projectId, title: task.title, model: task.model, temporary: false },
    })
    const prompt = [task.goal, task.instructions ? `执行要求：\n${task.instructions}` : ''].filter(Boolean).join('\n\n')
    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: 'USER', content: prompt, attachments: attachmentIds.length ? { create: attachmentIds.map((assetId) => ({ assetId })) } : undefined },
    })
    await this.prisma.agentTask.update({ where: { id: taskId }, data: { conversationId: conversation.id } })
    await this.completeStep(taskId, 0, `已加载模型与 ${attachmentIds.length} 个附件`)
    return { conversationId: conversation.id }
  }

  private async plan(taskId: string) {
    await this.startStep(taskId, 1, '正在根据目标生成可执行计划')
    await this.assertActive(taskId)
    const task = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId }, select: { goal: true, pluginId: true, assistantId: true } })
    const capabilities = [task.assistantId ? '组织助手' : '', task.pluginId ? '插件技能' : '', '模型生成', '结果校验'].filter(Boolean)
    await this.completeStep(taskId, 1, `计划：理解目标 → ${capabilities.join(' → ')} → 形成交付结果`)
    return {}
  }

  private async execute(taskId: string, runKey: string, conversationId: string) {
    await this.startStep(taskId, 2, '任务已进入模型执行队列')
    await this.assertActive(taskId)
    const task = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId } })
    const job = task.generationJobId
      ? await this.generations.get(task.userId, task.generationJobId)
      : await this.generations.create(task.userId, {
        kind: JobKind.CHAT,
        prompt: task.goal,
        model: task.model,
        projectId: task.projectId || undefined,
        conversationId,
        options: {
          officeMode: 'agent',
          officeSkill: task.skillId,
          agentTaskId: task.id,
          ...(task.assistantId ? { assistantId: task.assistantId } : {}),
          ...(task.pluginId ? { pluginId: task.pluginId } : {}),
        },
        idempotencyKey: `agent:${runKey}`,
      })
    if (!task.generationJobId) await this.prisma.agentTask.update({ where: { id: taskId }, data: { generationJobId: job.id } })
    try { await this.assertActive(taskId) }
    catch (error) {
      await this.generations.cancel(task.userId, job.id)
      throw error
    }
    while (true) {
      await this.assertActive(taskId)
      const current = await this.generations.get(task.userId, job.id)
      if (current.status === 'SUCCEEDED') {
        await this.completeStep(taskId, 2, '模型与已授权工具执行完成')
        return { generationJobId: job.id, answer: current.stream?.content || '' }
      }
      if (current.status === 'FAILED') throw new Error(current.errorMessage || '模型执行失败')
      if (current.status === 'CANCELLED') throw new AgentTaskCancelledError('任务已取消')
      await this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, position: 2, status: AgentTaskStepStatus.RUNNING }, data: { detail: current.stream?.content ? '正在接收并整理模型输出' : '模型正在分析任务并调用已授权能力' } })
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  private async verify(taskId: string, generationJobId: string) {
    await this.startStep(taskId, 3, '正在校验结果完整性')
    await this.assertActive(taskId)
    const task = await this.prisma.agentTask.findUniqueOrThrow({ where: { id: taskId }, select: { userId: true } })
    const result = await this.generations.get(task.userId, generationJobId)
    const answer = result.stream?.content?.trim() || ''
    if (!answer) throw new Error('模型没有返回可交付内容')
    return { answer }
  }

  private async deliver(taskId: string, answer: string) {
    await this.assertActive(taskId)
    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, position: 3 }, data: { status: AgentTaskStepStatus.SUCCEEDED, detail: `结果校验通过，共 ${answer.length} 个字符`, completedAt: now } }),
      this.prisma.agentTask.update({ where: { id: taskId }, data: { status: AgentTaskStatus.SUCCEEDED, completedAt: now, errorMessage: null } }),
    ])
    return {}
  }

  private async assertActive(taskId: string) {
    const task = await this.prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } })
    if (!task || task.status === AgentTaskStatus.CANCELLED) throw new AgentTaskCancelledError('任务已取消')
  }

  private async startStep(taskId: string, position: number, detail: string) {
    await this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, position }, data: { status: AgentTaskStepStatus.RUNNING, detail, startedAt: new Date(), completedAt: null } })
  }

  private async completeStep(taskId: string, position: number, detail: string) {
    await this.prisma.agentTaskStep.updateMany({ where: { agentTaskId: taskId, position }, data: { status: AgentTaskStepStatus.SUCCEEDED, detail, completedAt: new Date() } })
  }

  private attachmentIds(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }
}
