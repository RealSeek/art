import { Injectable } from '@nestjs/common'
import { GenerationSettlementStatus, JobStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { GenerationEventsService } from './generation-events.service'

export type GenerationLease = Readonly<{ workerId: string; leaseVersion: number }>

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
      data: { status: JobStatus.RUNNING, startedAt: now, lockedBy: workerId, leaseVersion: { increment: 1 }, heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
    })
    if (result.count) await this.events.append(id, 'running', payload).catch(() => undefined)
    return result.count === 1
  }

  async heartbeat(id: string, lease: GenerationLease, leaseMs = 60_000) {
    const now = new Date()
    return this.prisma.generationJob.updateMany({
      where: { id, status: JobStatus.RUNNING, lockedBy: lease.workerId, leaseVersion: lease.leaseVersion, leaseExpiresAt: { gt: now } },
      data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now },
    })
  }

  async releaseForRetry(id: string, lease: GenerationLease, payload?: Prisma.InputJsonValue) {
    const now = new Date()
    const result = await this.prisma.generationJob.updateMany({
      where: { id, status: JobStatus.RUNNING, lockedBy: lease.workerId, leaseVersion: lease.leaseVersion, leaseExpiresAt: { gt: now } },
      data: { status: JobStatus.QUEUED, lockedBy: null, heartbeatAt: null, leaseExpiresAt: null },
    })
    if (result.count) await this.events.append(id, 'requeued', payload ?? { reason: 'queue_retry' }).catch(() => undefined)
    return result.count === 1
  }

  async succeed(id: string, lease: GenerationLease) {
    const now = new Date()
    const result = await this.prisma.generationJob.updateMany({ where: { id, status: JobStatus.RUNNING, lockedBy: lease.workerId, leaseVersion: lease.leaseVersion, leaseExpiresAt: { gt: now } }, data: { status: JobStatus.SUCCEEDED, completedAt: now, lockedBy: null, heartbeatAt: null, leaseExpiresAt: null } })
    if (result.count) await this.events.append(id, 'done', { status: JobStatus.SUCCEEDED }).catch(() => undefined)
    return result.count === 1
  }

  async fail(id: string, code: string, message: string, payload?: Record<string, unknown>, lease?: GenerationLease) {
    const now = new Date()
    const result = await this.prisma.generationJob.updateMany({
      where: lease
        ? { id, status: JobStatus.RUNNING, lockedBy: lease.workerId, leaseVersion: lease.leaseVersion, leaseExpiresAt: { gt: now } }
        : { id, status: JobStatus.QUEUED },
      data: { status: JobStatus.FAILED, errorCode: code, errorMessage: message, completedAt: now, lockedBy: null, heartbeatAt: null, leaseExpiresAt: null },
    })
    if (result.count) await this.events.append(id, 'error', { code, message, ...payload }).catch(() => undefined)
    return result.count === 1
  }

  async cancel(id: string, userId: string) {
    const now = new Date()
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const cancellableWhere = {
        id,
        userId,
        status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
        settlementStatus: { in: [GenerationSettlementStatus.PENDING, GenerationSettlementStatus.RESERVED] },
      }
      // Updating the GenerationJob first acquires the same row lock used by
      // ProviderAttemptAuditService. Whichever operation wins determines
      // whether a Provider call can start; the loser observes its result.
      const locked = await tx.generationJob.updateMany({
        where: cancellableWhere,
        data: { updatedAt: now },
      })
      if (locked.count !== 1) return false

      const unresolvedAttempt = await tx.providerAttempt.findFirst({
        where: { generationId: id, status: { in: ['RUNNING', 'SUCCEEDED'] } },
        select: { id: true, status: true },
        orderBy: { startedAt: 'desc' },
      })
      const result = await tx.generationJob.updateMany({
        where: cancellableWhere,
        data: {
          status: JobStatus.CANCELLED,
          completedAt: now,
          lockedBy: null,
          leaseVersion: { increment: 1 },
          heartbeatAt: null,
          leaseExpiresAt: null,
          ...(unresolvedAttempt ? {
            settlementStatus: GenerationSettlementStatus.RECONCILING,
            errorCode: 'SETTLEMENT_RECONCILING',
            errorMessage: `取消时存在 ${unresolvedAttempt.status} ProviderAttempt，已保留账务预留等待对账`,
          } : {}),
        },
      })
      return result.count === 1
    })
    if (cancelled) await this.events.append(id, 'cancelled', { reason: 'user_request' }).catch(() => undefined)
    return cancelled
  }

  async appendRecovery(id: string) {
    await this.events.append(id, 'requeued', { reason: 'worker_recovery' }).catch(() => undefined)
  }
}
