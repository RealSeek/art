import { Injectable } from '@nestjs/common'
import { AgentTaskStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type CancellationWatch = { signal: AbortSignal; close: () => void }

@Injectable()
export class AgentTaskCancellationService {
  private readonly controllers = new Map<string, Set<AbortController>>()

  constructor(private readonly prisma: PrismaService) {}

  watch(taskId: string): CancellationWatch {
    const controller = new AbortController()
    const controllers = this.controllers.get(taskId) || new Set<AbortController>()
    controllers.add(controller)
    this.controllers.set(taskId, controllers)
    let checking = false
    const timer = setInterval(async () => {
      if (checking || controller.signal.aborted) return
      checking = true
      try {
        const task = await this.prisma.agentTask.findUnique({ where: { id: taskId }, select: { status: true } })
        if (!task || task.status === AgentTaskStatus.CANCELLED) this.abortController(controller)
      } catch {
        // A transient database error must not turn the interval into an unhandled rejection.
      } finally {
        checking = false
      }
    }, 500)
    timer.unref()

    return {
      signal: controller.signal,
      close: () => {
        clearInterval(timer)
        controllers.delete(controller)
        if (!controllers.size) this.controllers.delete(taskId)
      },
    }
  }

  cancel(taskId: string) {
    for (const controller of this.controllers.get(taskId) || []) this.abortController(controller)
  }

  signal(taskId: string) {
    return [...(this.controllers.get(taskId) || [])].find((controller) => !controller.signal.aborted)?.signal
  }

  private abortController(controller: AbortController) {
    if (!controller.signal.aborted) controller.abort(new Error('Agent 任务已取消'))
  }
}
