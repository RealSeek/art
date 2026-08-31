import { Injectable } from '@nestjs/common'
import { GenerationJob, Prisma } from '@prisma/client'
import { TokenQuotaService } from '../billing/token-quota.service'
import { BillingTransactionsService } from '../credits/billing-transactions.service'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'

export type TerminalReconciliationReason = 'FAILED' | 'CANCELLED'

@Injectable()
export class GenerationReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly billingTransactions: BillingTransactionsService,
    private readonly tokenQuota: TokenQuotaService,
  ) {}

  /**
   * Resolve an ambiguous, un-settled Provider call without ever replaying it.
   * The platform absorbs any unverifiable upstream cost; user holds are
   * released through idempotent credit and quota ledgers.
   */
  async finalizeTerminal(generationId: string, reason: TerminalReconciliationReason) {
    let task = await this.prisma.generationJob.findUnique({ where: { id: generationId } })
    if (!task || task.status !== reason) return task
    if (task.settlementStatus === 'SETTLED') return task

    // Publish the incomplete terminal state before any multi-step compensation.
    // A crash at any later point is therefore discoverable and retriable.
    if (task.settlementStatus === 'PENDING' || task.settlementStatus === 'RESERVED') {
      await this.prisma.generationJob.updateMany({
        where: {
          id: generationId,
          status: reason,
          settlementStatus: { in: ['PENDING', 'RESERVED'] },
        },
        data: { settlementStatus: 'RECONCILING' },
      })
      task = await this.prisma.generationJob.findUnique({ where: { id: generationId } })
      if (!task || task.status !== reason || task.settlementStatus === 'SETTLED') return task
    }

    // Fail closed before issuing a credit refund. A SETTLED reservation means
    // some quota was already charged and the mixed state needs manual repair;
    // refunding first would create a second, conflicting financial outcome.
    let reservations: Awaited<ReturnType<TokenQuotaService['reservationsForGeneration']>>
    try {
      reservations = await this.tokenQuota.reservationsForGeneration(task.userId, task.id)
    } catch {
      return this.prisma.generationJob.findUnique({ where: { id: generationId } })
    }
    if (reservations.some((reservation) => reservation.status === 'SETTLED')) {
      return this.prisma.generationJob.findUnique({ where: { id: generationId } })
    }

    // The job is already terminal before this write. A stale worker therefore
    // cannot turn the attempt back into SUCCEEDED because its lease is fenced
    // by ProviderAttemptAuditService. Keeping this transition after the job
    // transition is what prevents an old worker from changing a new owner's
    // attempt during recovery.
    await this.prisma.providerAttempt.updateMany({
      where: { generationId, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        endedAt: new Date(),
        errorCode: `RECONCILED_${reason}`,
        errorMessage: reason === 'CANCELLED'
          ? '任务已取消，未完成的 ProviderAttempt 已终止'
          : '任务已失败，未完成的 ProviderAttempt 已终止',
      },
    })
    if (task.settlementStatus === 'RELEASED' || task.settlementStatus === 'REFUNDED') {
      return this.prisma.generationJob.findUnique({ where: { id: generationId } })
    }

    const refundKey = reason === 'CANCELLED'
      ? `job:${generationId}:cancel-refund`
      : `job:${generationId}:failure-refund`
    const refund = await this.credits.refundOutstandingGeneration(
      task.userId,
      generationId,
      reason === 'CANCELLED' ? '取消生成任务退款' : '生成失败退款',
      refundKey,
      task.billingTeamId,
    )
    if (refund?.amount) {
      // Do not swallow this audit write. If it fails after the credit ledger
      // committed, the next reconciliation pass observes the idempotent credit
      // refund and retries only this BillingTransaction upsert.
      await this.billingTransactions.recordRefund({
        userId: task.userId,
        generationId,
        amount: refund.amount,
        provider: task.provider,
        idempotencyKey: refundKey,
        metadata: { reason, billingTeamId: task.billingTeamId, reconciled: true } as Prisma.InputJsonValue,
      })
    }

    const released = await this.releaseReservations(task, reservations)
    if (!released) return this.prisma.generationJob.findUnique({ where: { id: generationId } })
    await this.prisma.generationJob.updateMany({
      where: {
        id: generationId,
        status: reason,
        settlementStatus: { in: ['PENDING', 'RESERVED', 'RECONCILING'] },
      },
      data: { settlementStatus: refund?.amount ? 'REFUNDED' : 'RELEASED' },
    })
    return this.prisma.generationJob.findUnique({ where: { id: generationId } })
  }

  private async releaseReservations(
    task: Pick<GenerationJob, 'id' | 'userId'>,
    reservations: Awaited<ReturnType<TokenQuotaService['reservationsForGeneration']>>,
  ) {
    for (const reservation of reservations) {
      if (reservation.status !== 'RESERVED') continue
      try {
        await this.tokenQuota.release({
          userId: task.userId,
          reservationId: reservation.reservationId,
          quotaId: reservation.quotaId,
          generationId: task.id,
          metadata: { reason: 'GENERATION_RECONCILIATION' } as Prisma.InputJsonValue,
        })
      } catch {
        return false
      }
    }
    try {
      const remaining = await this.tokenQuota.reservationsForGeneration(task.userId, task.id)
      return !remaining.some((reservation) => reservation.status === 'RESERVED' || reservation.status === 'SETTLED')
    } catch {
      return false
    }
  }
}
