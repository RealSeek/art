import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { GenerationJob, Prisma } from '@prisma/client'
import { Job, Queue } from 'bullmq'
import { CreditsService } from '../credits/credits.service'
import { BillingTransactionsService } from '../credits/billing-transactions.service'
import { PrismaService } from '../prisma/prisma.service'
import { GenerationLifecycleService, type GenerationLease } from './generation-lifecycle.service'
import { GenerationJobCancelledError, GenerationRunnerRegistry } from './generation-runners'
import { ImageGenerationRunner } from './runners/image-generation.runner'
import { ChatGenerationRunner } from './runners/chat-generation.runner'
import { VideoGenerationRunner } from './runners/video-generation.runner'
import { GenerationOutputService } from './generation-output.service'
import { UsageRecordsService } from './usage-records.service'
import { ReconciliationRequiredError, TerminalProviderJobError, TerminalSettlementError } from './generation-provider-errors'
import { TokenQuotaService } from '../billing/token-quota.service'
import { runWithOutboundSignal } from '../common/outbound-http'
import { GenerationSettlementService } from './generation-settlement.service'

const RESERVATION_CREATION_GRACE_MS = 5_000
type ReleasableGeneration = Pick<GenerationJob, 'id' | 'userId' | 'status' | 'options'>

class GenerationLeaseLostError extends Error {
  constructor() {
    super('Generation worker lease was lost')
    this.name = 'GenerationLeaseLostError'
  }
}

@Injectable()
@Processor('generation', { concurrency: 20 })
export class GenerationsProcessor extends WorkerHost implements OnModuleInit {
  private readonly runners: GenerationRunnerRegistry
  private readonly workerId = `${process.env.HOSTNAME || 'generation-worker'}:${randomUUID()}`
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService, private readonly billingTransactions: BillingTransactionsService, private readonly lifecycle: GenerationLifecycleService, private readonly chatRunner: ChatGenerationRunner, private readonly imageRunner: ImageGenerationRunner, private readonly videoRunner: VideoGenerationRunner, private readonly outputs: GenerationOutputService, private readonly usageRecords: UsageRecordsService, private readonly tokenQuota: TokenQuotaService, private readonly settlement: GenerationSettlementService, @InjectQueue('generation') private readonly queue: Queue) {
    super()
    this.runners = new GenerationRunnerRegistry([
      this.chatRunner,
      this.imageRunner,
      this.videoRunner,
      { kind: 'COMMERCE', run: (task) => this.imageRunner.run(task) },
    ])
  }

  async onModuleInit() {
    await this.recoverTerminalReservations()
    const now = new Date()
    const staleJobs = await this.prisma.generationJob.findMany({
      where: {
        status: 'RUNNING',
        OR: [
          { leaseExpiresAt: { lt: now } },
          { leaseExpiresAt: null, updatedAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) } },
        ],
      },
      select: { id: true },
      take: 1000,
    })
    for (const job of staleJobs) {
      const reset = await this.prisma.generationJob.updateMany({
        where: {
          id: job.id,
          status: 'RUNNING',
          OR: [
            { leaseExpiresAt: { lt: now } },
            { leaseExpiresAt: null, updatedAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) } },
          ],
        },
        data: { status: 'QUEUED', startedAt: null, lockedBy: null, leaseVersion: { increment: 1 }, heartbeatAt: null, leaseExpiresAt: null },
      })
      if (reset.count) await this.lifecycle.appendRecovery(job.id)
    }
    const pending = await this.prisma.generationJob.findMany({
      where: {
        status: 'QUEUED',
        OR: [
          { settlementStatus: { in: ['PENDING', 'RESERVED', 'SETTLED'] } },
          { settlementStatus: 'RECONCILING', kind: { in: ['IMAGE', 'VIDEO', 'COMMERCE'] } },
        ],
      },
      select: { id: true, kind: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    })
    for (const task of pending) {
      const existing = await this.queue.getJob(task.id)
      if (existing) {
        const state = await existing.getState()
        if (!['waiting', 'prioritized', 'delayed', 'active'].includes(state)) await existing.remove().catch(() => undefined)
        else continue
      }
      await this.queue.add(task.kind.toLowerCase(), { jobId: task.id }, { jobId: task.id, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 })
    }
  }

  private async recoverTerminalReservations() {
    const terminalJobs = await this.prisma.generationJob.findMany({
      where: {
        status: { in: ['FAILED', 'CANCELLED'] },
        settlementStatus: { in: ['PENDING', 'RESERVED'] },
      },
      select: { id: true, userId: true, status: true, options: true },
      orderBy: { updatedAt: 'asc' },
      take: 1000,
    })
    for (const task of terminalJobs) {
      const safeToRelease = await this.prisma.$transaction(async (tx) => {
        // Serialize recovery with any final ProviderAttempt transition. A
        // terminal job normally cannot start a new attempt, but the row lock
        // also closes the crash window between cancellation and audit writes.
        const locked = await tx.generationJob.updateMany({
          where: {
            id: task.id,
            status: task.status,
            settlementStatus: { in: ['PENDING', 'RESERVED'] },
          },
          data: { updatedAt: new Date() },
        })
        if (locked.count !== 1) return false
        const unresolvedAttempt = await tx.providerAttempt.findFirst({
          where: { generationId: task.id, status: { in: ['RUNNING', 'SUCCEEDED'] } },
          select: { id: true, status: true },
          orderBy: { startedAt: 'desc' },
        })
        if (!unresolvedAttempt) return true
        const reconciled = await tx.generationJob.updateMany({
          where: {
            id: task.id,
            status: task.status,
            settlementStatus: { in: ['PENDING', 'RESERVED'] },
          },
          data: {
            settlementStatus: 'RECONCILING',
            errorCode: 'SETTLEMENT_RECONCILING',
            errorMessage: `终态恢复发现 ${unresolvedAttempt.status} ProviderAttempt，已阻止自动释放`,
          },
        })
        if (reconciled.count !== 1) throw new Error('终态任务对账状态发生并发变化')
        return false
      })
      if (!safeToRelease) continue
      const released = await this.releaseTokenReservation(task)
      if (!released) continue
      await this.prisma.generationJob.updateMany({
        where: {
          id: task.id,
          status: task.status,
          settlementStatus: { in: ['PENDING', 'RESERVED'] },
        },
        data: { settlementStatus: 'RELEASED' },
      })
    }
  }

  async process(queueJob: Job<{ jobId: string }>) {
    const started = await this.lifecycle.claim(queueJob.data.jobId, this.workerId, { attempt: queueJob.attemptsMade + 1 })
    let task = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: queueJob.data.jobId } })
    if (!started || task.status === 'CANCELLED' || task.lockedBy !== this.workerId) return task
    const lease: GenerationLease = { workerId: this.workerId, leaseVersion: task.leaseVersion }
    const abortController = new AbortController()
    let leaseLost = false
    let heartbeatRunning = false
    const heartbeat = setInterval(() => {
      if (heartbeatRunning || leaseLost) return
      heartbeatRunning = true
      void this.lifecycle.heartbeat(task.id, lease)
        .then((result) => {
          if (result.count !== 1) {
            leaseLost = true
            abortController.abort(new GenerationLeaseLostError())
          }
        })
        .catch(() => {
          leaseLost = true
          abortController.abort(new GenerationLeaseLostError())
        })
        .finally(() => { heartbeatRunning = false })
    }, 15_000)
    try {
      // A worker can crash after the atomic billing commit but before the job
      // lifecycle is marked successful. Recovery must finish bookkeeping only;
      // calling the Provider again would duplicate upstream cost and output.
      if (task.settlementStatus === 'RECONCILING') {
        if (task.kind === 'CHAT') throw new ReconciliationRequiredError('聊天任务需要人工账务对账，已阻止重复调用 Provider')
        await runWithOutboundSignal(abortController.signal, () => this.settlement.settleNonChat(task.id), lease)
      } else if (task.settlementStatus !== 'SETTLED') {
        // Reservation creation is intentionally outside the job-options update
        // transaction. Reconcile that narrow crash window before any runner
        // can reach a Provider, using the reservation table as the source of
        // truth instead of trusting a possibly stale JSON snapshot.
        task = await this.recoverTokenReservations(task)
        await runWithOutboundSignal(abortController.signal, async () => {
          await this.runners.run(task)
          if (task.kind !== 'CHAT') {
            const completed = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
            if (completed.settlementStatus !== 'SETTLED') await this.settlement.settleNonChat(task.id)
          }
        }, lease)
      }
      task = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
      if (task.settlementStatus !== 'SETTLED') throw new ReconciliationRequiredError('生成结果尚未完成原子结算')
      if (leaseLost) throw new GenerationLeaseLostError()
      const renewed = await this.lifecycle.heartbeat(task.id, lease)
      if (renewed.count !== 1) throw new GenerationLeaseLostError()
      const usage = await this.prisma.generationJob.findUnique({ where: { id: task.id }, select: { inputTokens: true, outputTokens: true, upstreamCostMicros: true } })
      if (usage) {
        const attempts = await this.prisma.providerAttempt.findMany({
          where: { generationId: task.id, status: 'SUCCEEDED' },
          select: { id: true, metadata: true },
        })
        const primaryAttemptIds = attempts
          .filter((attempt) => {
            const metadata = attempt.metadata && typeof attempt.metadata === 'object' && !Array.isArray(attempt.metadata)
              ? attempt.metadata as Record<string, unknown>
              : {}
            return metadata.auxiliary !== true && metadata.usageRecorded !== true
          })
          .map((attempt) => attempt.id)
        if (primaryAttemptIds.length) {
          await this.prisma.providerAttempt.updateMany({
            where: { id: { in: primaryAttemptIds } },
            data: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, upstreamCostMicros: usage.upstreamCostMicros },
          })
        }
      }
      const settled = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
      await this.completeSettledBookkeeping(settled)
      if (!await this.lifecycle.succeed(task.id, lease)) throw new GenerationLeaseLostError()
      return this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
    } catch (error) {
      const current = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
      if (error instanceof GenerationLeaseLostError
        || (current.status !== 'CANCELLED' && (current.status !== 'RUNNING'
          || current.lockedBy !== lease.workerId
          || current.leaseVersion !== lease.leaseVersion
          || !current.leaseExpiresAt
          || current.leaseExpiresAt.getTime() <= Date.now()))) {
        return current
      }
      // Financial settlement is the terminal source of truth. Post-settlement
      // audit failures are retried without calling the Provider again.
      if (current.settlementStatus === 'SETTLED') {
        if (current.status === 'RUNNING') await this.lifecycle.releaseForRetry(current.id, lease, { reason: 'post_settlement_bookkeeping', attemptsMade: queueJob.attemptsMade + 1 })
        throw error
      }
      if (error instanceof ReconciliationRequiredError || current.settlementStatus === 'RECONCILING') {
        const message = error instanceof Error ? error.message : '任务需要账务对账'
        const marked = await this.prisma.generationJob.updateMany({
          where: { id: current.id, status: 'RUNNING', lockedBy: lease.workerId, leaseVersion: lease.leaseVersion, leaseExpiresAt: { gt: new Date() } },
          data: { settlementStatus: 'RECONCILING', errorCode: 'SETTLEMENT_RECONCILING', errorMessage: message.slice(0, 500) },
        })
        if (marked.count) await this.lifecycle.releaseForRetry(current.id, lease, { reason: 'settlement_reconciliation', attemptsMade: queueJob.attemptsMade + 1 })
        throw error
      }
      if (current.status === 'CANCELLED' || error instanceof GenerationJobCancelledError) {
        const creditRefund = await this.credits.refundOutstandingGeneration(current.userId, current.id, '取消生成任务退款', `job:${current.id}:cancel-refund`, current.billingTeamId)
        if (creditRefund?.amount) {
          await this.billingTransactions.safely(this.billingTransactions.recordRefund({ userId: current.userId, generationId: current.id, amount: creditRefund.amount, provider: current.provider, idempotencyKey: `job:${current.id}:cancel-refund`, metadata: { reason: 'CANCELLED', billingTeamId: current.billingTeamId } as Prisma.InputJsonValue }), `${current.id}:cancel-refund`)
        }
        const released = await this.releaseTokenReservation(current)
        await this.prisma.generationJob.updateMany({
          where: { id: task.id, status: 'CANCELLED', settlementStatus: { in: ['PENDING', 'RESERVED', 'RECONCILING'] } },
          data: { settlementStatus: released ? (creditRefund?.amount ? 'REFUNDED' : 'RELEASED') : 'RECONCILING' },
        }).catch(() => undefined)
        await this.finishPluginUsage(task, 'CANCELLED')
        await this.cleanupCancelledSideEffects(task)
        await this.recordUsage(current)
        return current
      }
      const finalAttempt = error instanceof TerminalProviderJobError || error instanceof TerminalSettlementError || queueJob.attemptsMade + 1 >= (queueJob.opts.attempts || 1)
      if (finalAttempt) {
        if (task.conversationId) await this.prisma.message.deleteMany({ where: { conversationId: task.conversationId, metadata: { path: ['jobId'], equals: task.id } } })
        const message = error instanceof Error ? error.message : 'Provider request failed'
        const failed = await this.lifecycle.fail(task.id, error instanceof TerminalSettlementError ? 'SETTLEMENT_ERROR' : 'PROVIDER_ERROR', message, { attemptsMade: queueJob.attemptsMade + 1 }, lease)
        const creditRefund = failed
          ? await this.credits.refundOutstandingGeneration(current.userId, current.id, '生成失败退款', `job:${current.id}:failure-refund`, current.billingTeamId)
          : null
        if (creditRefund?.amount) {
          await this.billingTransactions.safely(this.billingTransactions.recordRefund({ userId: current.userId, generationId: current.id, amount: creditRefund.amount, provider: current.provider, idempotencyKey: `job:${current.id}:failure-refund`, metadata: { reason: 'FAILED', billingTeamId: current.billingTeamId } as Prisma.InputJsonValue }), `${current.id}:failure-refund`)
        }
        const released = failed ? await this.releaseTokenReservation(current) : true
        if (failed) await this.prisma.generationJob.updateMany({ where: { id: task.id, settlementStatus: { in: ['PENDING', 'RESERVED', 'RECONCILING'] } }, data: { settlementStatus: released ? (creditRefund?.amount ? 'REFUNDED' : 'RELEASED') : 'RECONCILING' } }).catch(() => undefined)
        if (failed) await this.finishPluginUsage(task, 'FAILED', message)
        await this.recordUsageById(task.id)
      } else {
        await this.lifecycle.releaseForRetry(task.id, lease, { reason: 'queue_retry', attemptsMade: queueJob.attemptsMade + 1 })
      }
      throw error
    } finally {
      clearInterval(heartbeat)
      abortController.abort()
    }
  }

  private async recoverTokenReservations(task: GenerationJob): Promise<GenerationJob> {
    const options = task.options && typeof task.options === 'object' && !Array.isArray(task.options) ? task.options as Record<string, unknown> : {}
    const billing = options.billing && typeof options.billing === 'object' && !Array.isArray(options.billing) ? options.billing as Record<string, unknown> : {}
    const pricingSnapshot = task.pricingSnapshot && typeof task.pricingSnapshot === 'object' && !Array.isArray(task.pricingSnapshot) ? task.pricingSnapshot as Record<string, unknown> : {}
    if (task.settlementStatus === 'RECONCILING') {
      throw new TerminalSettlementError('任务账务处于待对账状态，已阻止重复调用 Provider')
    }
    const createdAt = task.createdAt instanceof Date ? task.createdAt.getTime() : 0
    if (task.settlementStatus === 'PENDING' && Date.now() - createdAt < RESERVATION_CREATION_GRACE_MS) {
      // Another application instance may still be creating the monthly/daily
      // holds. Let BullMQ retry instead of treating that transient prefix as a
      // corrupt partial reservation and releasing it underneath the creator.
      throw new Error('计费预留仍在创建中，请稍后重试')
    }
    if (billing.quotaEnabled !== true) {
      if (task.settlementStatus === 'PENDING') {
        throw new TerminalSettlementError('任务预授权未完成，已阻止 Provider 调用')
      }
      return task
    }

    const listedOptionReservations = Array.isArray(billing.quotaReservations)
      ? billing.quotaReservations.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const row = item as Record<string, unknown>
        if (typeof row.quotaId !== 'string') return []
        return [{ reservationId: typeof row.reservationId === 'string' ? row.reservationId : undefined, quotaId: row.quotaId }]
      })
      : []
    const optionReservations = [...listedOptionReservations]
    if (typeof billing.quotaId === 'string' && !optionReservations.some((reservation) => reservation.quotaId === billing.quotaId)) {
      optionReservations.push({ reservationId: undefined, quotaId: billing.quotaId })
    }
    const expectedRaw = billing.expectedReservationCount ?? pricingSnapshot.expectedReservationCount
    const expectedCount = expectedRaw === undefined
      ? optionReservations.length
      : Number(expectedRaw)
    const expectedScopeValue = billing.expectedReservationScopes ?? pricingSnapshot.expectedReservationScopes
    const expectedScopes = Array.isArray(expectedScopeValue)
      ? expectedScopeValue.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0)
      : []
    let expectedUnits = 0n
    try {
      expectedUnits = BigInt(String(billing.expectedReservationUnits ?? pricingSnapshot.expectedReservationUnits ?? billing.reservedTokenUnits ?? 0))
    } catch { /* The validation below fails closed for malformed snapshots. */ }
    if (!Number.isInteger(expectedCount)
      || expectedCount <= 0
      || expectedUnits <= 0n
      || (expectedScopes.length > 0 && (expectedScopes.length !== expectedCount || new Set(expectedScopes).size !== expectedScopes.length))) {
      throw new TerminalSettlementError('计费预留缺少有效的期望范围')
    }

    let databaseReservations: Awaited<ReturnType<TokenQuotaService['reservationsForGeneration']>>
    try {
      databaseReservations = await this.tokenQuota.reservationsForGeneration(task.userId, task.id)
    } catch {
      throw new TerminalSettlementError('计费预留查询失败，已阻止 Provider 调用')
    }
    const complete = databaseReservations.length === expectedCount
      && databaseReservations.every((reservation) => reservation.status === 'RESERVED')
      && databaseReservations.every((reservation) => reservation.reservedUnits >= expectedUnits)
      && (expectedScopes.length === 0 || new Set(databaseReservations.map((reservation) => reservation.scopeKey)).size === expectedScopes.length
        && databaseReservations.every((reservation) => expectedScopes.includes(reservation.scopeKey)))
      && (optionReservations.length === 0 || optionReservations.every((option) => databaseReservations.some((reservation) => reservation.quotaId === option.quotaId)))
    if (!complete) {
      if (databaseReservations.some((reservation) => reservation.status === 'SETTLED')) {
        throw new TerminalSettlementError('计费预留状态冲突，需要人工对账')
      }
      const active = databaseReservations
        .filter((reservation) => reservation.status === 'RESERVED')
        .map((reservation) => ({ reservationId: reservation.reservationId, quotaId: reservation.quotaId }))
      const released = await this.releaseReservationRefs(task, active)
      if (!released) throw new TerminalSettlementError('计费预留不完整且释放失败')
      throw new TerminalSettlementError('计费预留不完整，已阻止 Provider 调用')
    }

    const recoveredReservations = databaseReservations.map((reservation) => ({
      reservationId: reservation.reservationId,
      quotaId: reservation.quotaId,
      reservedUnits: reservation.reservedUnits.toString(),
    }))
    const recoveredBilling = {
      ...billing,
      quotaId: recoveredReservations[0]?.quotaId,
      quotaReservations: recoveredReservations,
      expectedReservationCount: expectedCount,
      expectedReservationScopes: databaseReservations.map((reservation) => reservation.scopeKey),
      expectedReservationUnits: expectedUnits.toString(),
    }
    const updated = await this.prisma.generationJob.updateMany({
      where: {
        id: task.id,
        userId: task.userId,
        status: 'RUNNING',
        lockedBy: task.lockedBy,
        leaseVersion: task.leaseVersion,
        leaseExpiresAt: { gt: new Date() },
        settlementStatus: { in: ['PENDING', 'RESERVED', 'RECONCILING'] },
      },
      data: {
        options: { ...options, billing: recoveredBilling } as Prisma.InputJsonValue,
        settlementStatus: 'RESERVED',
      },
    })
    if (!updated.count) throw new GenerationJobCancelledError('Generation job was cancelled before billing recovery')
    return this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
  }

  private async releaseReservationRefs(task: ReleasableGeneration, reservations: Array<{ reservationId?: string; quotaId: string }>) {
    let released = true
    for (const reservation of reservations) {
      try {
        await this.tokenQuota.release({
          userId: task.userId,
          reservationId: reservation.reservationId,
          quotaId: reservation.quotaId,
          generationId: task.id,
          metadata: { reason: task.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED' } as Prisma.InputJsonValue,
        })
      } catch {
        released = false
      }
    }
    return released
  }

  private async releaseTokenReservation(task: ReleasableGeneration): Promise<boolean> {
    const options = task.options && typeof task.options === 'object' && !Array.isArray(task.options) ? task.options as Record<string, unknown> : {}
    const billing = options.billing && typeof options.billing === 'object' && !Array.isArray(options.billing) ? options.billing as Record<string, unknown> : {}
    const optionReservations = Array.isArray(billing.quotaReservations)
      ? billing.quotaReservations.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const row = item as Record<string, unknown>
        if (typeof row.quotaId !== 'string') return []
        return [{ reservationId: typeof row.reservationId === 'string' ? row.reservationId : undefined, quotaId: row.quotaId }]
      })
      : []
    if (typeof billing.quotaId === 'string' && !optionReservations.some((reservation) => reservation.quotaId === billing.quotaId)) {
      optionReservations.push({ reservationId: undefined, quotaId: billing.quotaId })
    }
    let databaseLookupSucceeded = true
    let databaseReservations: Awaited<ReturnType<TokenQuotaService['reservationsForGeneration']>> = []
    try {
      databaseReservations = await this.tokenQuota.reservationsForGeneration(task.userId, task.id)
    } catch {
      databaseLookupSucceeded = false
    }
    if (databaseReservations.some((reservation) => reservation.status === 'SETTLED')) return false
    const reservations = new Map(optionReservations.map((reservation) => [reservation.quotaId, reservation]))
    for (const reservation of databaseReservations) {
      if (reservation.status !== 'RESERVED') continue
      reservations.set(reservation.quotaId, { reservationId: reservation.reservationId, quotaId: reservation.quotaId })
    }
    const released = await this.releaseReservationRefs(task, [...reservations.values()])
    return databaseLookupSucceeded && released
  }

  private async completeSettledBookkeeping(task: GenerationJob) {
    await this.finishPluginUsage(task, 'SUCCEEDED')
    await this.billingTransactions.recordCapture({ userId: task.userId, generationId: task.id, amount: task.creditCost, provider: task.provider, inputTokens: task.inputTokens, outputTokens: task.outputTokens, cachedInputTokens: task.cachedInputTokens, reasoningTokens: task.reasoningTokens, upstreamCostMicros: task.upstreamCostMicros, idempotencyKey: `job:${task.id}:capture`, metadata: { billingTeamId: task.billingTeamId, pricingSnapshot: task.pricingSnapshot } as Prisma.InputJsonValue })
    await this.recordUsage(task, 'SUCCEEDED')
  }

  private async recordUsage(task: GenerationJob, status = task.status) {
    const outputCount = await this.prisma.jobOutput.count({ where: { jobId: task.id } })
    const options = task.options && typeof task.options === 'object' && !Array.isArray(task.options) ? task.options as Record<string, unknown> : {}
    const duration = Number(options.duration || options.seconds || 0)
    await this.usageRecords.record({
      generationId: task.id,
      userId: task.userId,
      provider: task.provider,
      providerId: task.providerChannelId,
      model: task.model,
      inputTokens: task.inputTokens,
      outputTokens: task.outputTokens,
      cachedInputTokens: task.cachedInputTokens,
      reasoningTokens: task.reasoningTokens,
      imageCount: task.kind === 'IMAGE' || task.kind === 'COMMERCE' ? outputCount : 0,
      videoSeconds: task.kind === 'VIDEO' ? Math.max(0, Math.floor(duration)) : 0,
      upstreamCostMicros: task.upstreamCostMicros,
      metadata: { status, kind: task.kind } as Prisma.InputJsonValue,
    })
  }

  private async recordUsageById(id: string) {
    const task = await this.prisma.generationJob.findUnique({ where: { id } })
    if (task) await this.recordUsage(task)
  }

  private async finishPluginUsage(task: GenerationJob, status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED', error?: string) {
    const options = task.options as Record<string, unknown>
    const pluginId = typeof options.pluginId === 'string' ? options.pluginId : ''
    if (!pluginId) return
    const usage = await this.prisma.pluginUsage.updateMany({ where: { jobId: task.id, status: 'QUEUED' }, data: { status, error: error?.slice(0, 4_000) || null } })
    if (usage.count) await this.prisma.plugin.update({ where: { id: pluginId }, data: { usageCount: { increment: 1 }, ...(status === 'FAILED' ? { errorCount: { increment: 1 } } : {}) } })
  }

  private async cleanupCancelledSideEffects(task: GenerationJob) {
    if (task.conversationId) {
      await this.prisma.message.deleteMany({ where: { conversationId: task.conversationId, metadata: { path: ['jobId'], equals: task.id } } })
    }
    await this.outputs.cleanup(task)
  }

}
