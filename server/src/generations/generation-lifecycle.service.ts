import { Injectable } from '@nestjs/common'
import { JobStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { GenerationEventsService } from './generation-events.service'

@Injectable()
export class GenerationLifecycleService {
  constructor(private readonly prisma: PrismaService, private readonly events: GenerationEventsService) {}

  async start(id: string, payload?: Prisma.InputJsonValue) {
    const result = await this.prisma.generationJob.updateMany({ where: { id, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } }, data: { status: JobStatus.RUNNING, startedAt: new Date() } })
    if (result.count) await this.events.append(id, 'running', payload).catch(() => undefined)
    return result.count === 1
  }

  async claim(id: string, workerId: string, payload?: Prisma.InputJsonValue, leaseMs = 60_000) {
    const now = new Date()
    const result = await this.prisma.generationJob.updateMany({
      where: { id, status: JobStatus.QUEUED, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      data: { status: JobStatus.RUNNING, startedAt: now, lockedBy: workerId, heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
    })
    if (result.count) await this.events.append(id, 'running', payload).catch(() => undefined)
    return result.count === 1
  }

  async heartbeat(id: string, workerId: string, leaseMs = 60_000) {
    const now = new Date()
    return this.prisma.generationJob.updateMany({ where: { id, status: JobStatus.RUNNING, lockedBy: workerId }, data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now } })
  }

  async releaseForRetry(id: string, workerId: string, payload?: Prisma.InputJsonValue) {
    const result = await this.prisma.generationJob.updateMany({
      where: { id, status: JobStatus.RUNNING, lockedBy: workerId },
      data: { status: JobStatus.QUEUED, lockedBy: null, heartbeatAt: null, leaseExpiresAt: null },
    })
    if (result.count) await this.events.append(id, 'requeued', payload ?? { reason: 'queue_retry' }).catch(() => undefined)
    return result.count === 1
  }

  async succeed(id: string) {
    const result = await this.prisma.generationJob.updateMany({ where: { id, status: JobStatus.RUNNING }, data: { status: JobStatus.SUCCEEDED, completedAt: new Date(), lockedBy: null, heartbeatAt: null, leaseExpiresAt: null } })
    if (result.count) await this.events.append(id, 'done', { status: JobStatus.SUCCEEDED }).catch(() => undefined)
    return result.count === 1
  }

  async fail(id: string, code: string, message: string, payload?: Record<string, unknown>) {
    const result = await this.prisma.generationJob.updateMany({ where: { id, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } }, data: { status: JobStatus.FAILED, errorCode: code, errorMessage: message, completedAt: new Date(), lockedBy: null, heartbeatAt: null, leaseExpiresAt: null } })
    if (result.count) await this.events.append(id, 'error', { code, message, ...payload }).catch(() => undefined)
    return result.count === 1
  }

  async cancel(id: string, userId: string) {
    const result = await this.prisma.generationJob.updateMany({ where: { id, userId, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } }, data: { status: JobStatus.CANCELLED, completedAt: new Date(), lockedBy: null, heartbeatAt: null, leaseExpiresAt: null } })
    if (result.count) await this.events.append(id, 'cancelled', { reason: 'user_request' }).catch(() => undefined)
    return result.count === 1
  }

  async appendRecovery(id: string) {
    await this.events.append(id, 'requeued', { reason: 'worker_recovery' }).catch(() => undefined)
  }
}
