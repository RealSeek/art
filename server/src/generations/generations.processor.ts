import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { GenerationJob, Prisma } from '@prisma/client'
import { Job, Queue } from 'bullmq'
import { CreditsService } from '../credits/credits.service'
import { BillingTransactionsService } from '../credits/billing-transactions.service'
import { PrismaService } from '../prisma/prisma.service'
import { GenerationLifecycleService } from './generation-lifecycle.service'
import { GenerationJobCancelledError, GenerationRunnerRegistry } from './generation-runners'
import { ImageGenerationRunner } from './runners/image-generation.runner'
import { ChatGenerationRunner } from './runners/chat-generation.runner'
import { VideoGenerationRunner } from './runners/video-generation.runner'
import { GenerationOutputService } from './generation-output.service'
import { UsageRecordsService } from './usage-records.service'
import { TerminalProviderJobError } from './generation-provider-errors'
import { TokenQuotaService } from '../billing/token-quota.service'

@Injectable()
@Processor('generation', { concurrency: 20 })
export class GenerationsProcessor extends WorkerHost implements OnModuleInit {
  private readonly runners: GenerationRunnerRegistry
  private readonly workerId = `${process.env.HOSTNAME || 'generation-worker'}:${randomUUID()}`
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService, private readonly billingTransactions: BillingTransactionsService, private readonly lifecycle: GenerationLifecycleService, private readonly chatRunner: ChatGenerationRunner, private readonly imageRunner: ImageGenerationRunner, private readonly videoRunner: VideoGenerationRunner, private readonly outputs: GenerationOutputService, private readonly usageRecords: UsageRecordsService, private readonly tokenQuota: TokenQuotaService, @InjectQueue('generation') private readonly queue: Queue) {
    super()
    this.runners = new GenerationRunnerRegistry([
      this.chatRunner,
      this.imageRunner,
      this.videoRunner,
      { kind: 'COMMERCE', run: (task) => this.imageRunner.run(task) },
    ])
  }

  async onModuleInit() {
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
        data: { status: 'QUEUED', startedAt: null, lockedBy: null, heartbeatAt: null, leaseExpiresAt: null },
      })
      if (reset.count) await this.lifecycle.appendRecovery(job.id)
    }
    const pending = await this.prisma.generationJob.findMany({ where: { status: 'QUEUED' }, select: { id: true, kind: true }, orderBy: { createdAt: 'asc' }, take: 1000 })
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
  async process(queueJob: Job<{ jobId: string }>) {
    const started = await this.lifecycle.claim(queueJob.data.jobId, this.workerId, { attempt: queueJob.attemptsMade + 1 })
    const task = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: queueJob.data.jobId } })
    if (!started || task.status === 'CANCELLED') return task
    const heartbeat = setInterval(() => {
      void this.lifecycle.heartbeat(task.id, this.workerId).catch(() => undefined)
    }, 15_000)
    try {
      await this.runners.run(task)
      const usage = await this.prisma.generationJob.findUnique({ where: { id: task.id }, select: { inputTokens: true, outputTokens: true, upstreamCostMicros: true } })
      if (usage) await this.prisma.providerAttempt.updateMany({ where: { generationId: task.id, status: 'SUCCEEDED' }, data: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, upstreamCostMicros: usage.upstreamCostMicros } })
      await this.lifecycle.succeed(task.id)
      await this.finishPluginUsage(task, 'SUCCEEDED')
      const current = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
      if (current.status === 'SUCCEEDED') await this.billingTransactions.safely(this.billingTransactions.recordCapture({ userId: current.userId, generationId: current.id, amount: current.creditCost, provider: current.provider, inputTokens: current.inputTokens, outputTokens: current.outputTokens, cachedInputTokens: current.cachedInputTokens, reasoningTokens: current.reasoningTokens, upstreamCostMicros: current.upstreamCostMicros, idempotencyKey: `job:${current.id}:capture`, metadata: { billingTeamId: current.billingTeamId, pricingSnapshot: current.pricingSnapshot } as Prisma.InputJsonValue }), `${current.id}:capture`)
      await this.recordUsage(current)
      if (current.status === 'CANCELLED') await this.cleanupCancelledSideEffects(task)
      return current
    } catch (error) {
      const current = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: task.id } })
      if (current.status === 'CANCELLED' || error instanceof GenerationJobCancelledError) {
        await this.releaseTokenReservation(current)
        await this.finishPluginUsage(task, 'CANCELLED')
        await this.cleanupCancelledSideEffects(task)
        await this.recordUsage(current)
        return current
      }
      const finalAttempt = error instanceof TerminalProviderJobError || queueJob.attemptsMade + 1 >= (queueJob.opts.attempts || 1)
      if (finalAttempt) {
        if (task.conversationId) await this.prisma.message.deleteMany({ where: { conversationId: task.conversationId, metadata: { path: ['jobId'], equals: task.id } } })
        const message = error instanceof Error ? error.message : 'Provider request failed'
        const failed = await this.lifecycle.fail(task.id, 'PROVIDER_ERROR', message, { attemptsMade: queueJob.attemptsMade + 1 })
        if (failed && task.creditCost > 0) {
          await this.credits.refund(task.userId, task.creditCost, '生成失败退款', `job:${task.id}:failure-refund`, { type: 'generation_job', id: task.id }, task.billingTeamId)
          await this.billingTransactions.safely(this.billingTransactions.recordRefund({ userId: task.userId, generationId: task.id, amount: task.creditCost, provider: task.provider, idempotencyKey: `job:${task.id}:failure-refund`, metadata: { reason: 'FAILED', billingTeamId: task.billingTeamId } as Prisma.InputJsonValue }), `${task.id}:failure-refund`)
        }
        if (failed) await this.releaseTokenReservation(task)
        if (failed) await this.prisma.generationJob.updateMany({ where: { id: task.id, settlementStatus: { in: ['PENDING', 'RESERVED'] } }, data: { settlementStatus: task.creditCost > 0 ? 'REFUNDED' : 'RELEASED' } }).catch(() => undefined)
        if (failed) await this.finishPluginUsage(task, 'FAILED', message)
        await this.recordUsageById(task.id)
      } else {
        await this.lifecycle.releaseForRetry(task.id, this.workerId, { reason: 'queue_retry', attemptsMade: queueJob.attemptsMade + 1 })
      }
      throw error
    } finally {
      clearInterval(heartbeat)
    }
  }

  private async releaseTokenReservation(task: GenerationJob) {
    const options = task.options && typeof task.options === 'object' && !Array.isArray(task.options) ? task.options as Record<string, unknown> : {}
    const billing = options.billing && typeof options.billing === 'object' && !Array.isArray(options.billing) ? options.billing as Record<string, unknown> : {}
    if (billing.quotaEnabled !== true) return
    const reservations = Array.isArray(billing.quotaReservations)
      ? billing.quotaReservations.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const row = item as Record<string, unknown>
        if (typeof row.quotaId !== 'string') return []
        try { return [{ quotaId: row.quotaId, reservedUnits: BigInt(String(row.reservedUnits || 0)) }] } catch { return [] }
      })
      : typeof billing.quotaId === 'string' ? [{ quotaId: billing.quotaId, reservedUnits: BigInt(Math.max(0, Number(billing.reservedTokenCredits || 0))) }] : []
    for (const reservation of reservations) await this.tokenQuota.release({ userId: task.userId, quotaId: reservation.quotaId, generationId: task.id, reservedUnits: reservation.reservedUnits, metadata: { reason: task.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED' } as Prisma.InputJsonValue }).catch(() => undefined)
  }

  private async recordUsage(task: GenerationJob) {
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
      metadata: { status: task.status, kind: task.kind } as Prisma.InputJsonValue,
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
