import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import {
  GenerationSettlementStatus,
  Prisma,
  TokenQuotaEventType,
  TokenQuotaReservationStatus,
  TokenQuotaStatus,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { tokenUsageLedgerData, type TokenUsageLedgerInput } from './token-usage-ledger.service'
import { currentOutboundExecutionLease, type OutboundExecutionLease } from '../common/outbound-http'

class QuotaConcurrencyError extends ConflictException {}

export type QuotaReservation = {
  reservationId: string
  quotaId: string
  reservedUnits: bigint
  version: number
}

export type QuotaReservationRef = {
  reservationId?: string
  quotaId: string
}

export type GenerationQuotaReservation = {
  reservationId: string
  quotaId: string
  userId: string
  generationId: string
  reservedUnits: bigint
  chargedUnits: bigint
  status: TokenQuotaReservationStatus
  scopeKey: string
}

export type QuotaSettlementInput = {
  reservationId?: string
  userId: string
  quotaId: string
  generationId: string
  chargedUnits: bigint
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  reasoningTokens?: number
  metadata?: Prisma.InputJsonValue
}

export type QuotaSummary = {
  quotaId: string | null
  scopeKey: string | null
  periodStart: Date | null
  periodEnd: Date | null
  grantedUnits: bigint
  reservedUnits: bigint
  usedUnits: bigint
  remainingUnits: bigint
  inputTokens: bigint
  outputTokens: bigint
  cachedInputTokens: bigint
  reasoningTokens: bigint
}

@Injectable()
export class TokenQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  private eventKey(reservationId: string, action: string) {
    return `reservation:${reservationId}:${action}`
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        lastError = error
        const retryable = error instanceof QuotaConcurrencyError
          || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        if (!retryable) throw error
      }
    }
    throw lastError
  }

  async reservationsForGeneration(userId: string, generationId: string): Promise<GenerationQuotaReservation[]> {
    const rows = await this.prisma.tokenQuotaReservation.findMany({
      where: { userId, generationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        quotaId: true,
        userId: true,
        generationId: true,
        reservedUnits: true,
        chargedUnits: true,
        status: true,
        quota: { select: { scopeKey: true } },
      },
    })
    return rows.map((row) => ({
      reservationId: row.id,
      quotaId: row.quotaId,
      userId: row.userId,
      generationId: row.generationId,
      reservedUnits: row.reservedUnits,
      chargedUnits: row.chargedUnits,
      status: row.status,
      scopeKey: row.quota.scopeKey,
    }))
  }

  async reserve(input: {
    userId: string
    subscriptionId?: string | null
    scopeKey: string
    periodStart: Date
    periodEnd: Date
    grantedUnits: bigint
    units: bigint
    generationId: string
    metadata?: Prisma.InputJsonValue
  }): Promise<QuotaReservation | null> {
    if (input.units <= 0n || input.grantedUnits <= 0n) return null
    return this.serializable(async (tx) => {
      const quota = await tx.userTokenQuota.upsert({
        where: { userId_scopeKey_periodStart: { userId: input.userId, scopeKey: input.scopeKey, periodStart: input.periodStart } },
        create: {
          userId: input.userId,
          subscriptionId: input.subscriptionId || null,
          scopeKey: input.scopeKey,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          grantedUnits: input.grantedUnits,
        },
        update: {},
      })
      const existing = await tx.tokenQuotaReservation.findUnique({
        where: { generationId_quotaId: { generationId: input.generationId, quotaId: quota.id } },
      })
      if (existing) {
        if (existing.userId !== input.userId
          || existing.status !== TokenQuotaReservationStatus.RESERVED
          || existing.reservedUnits !== input.units) {
          throw new ConflictException('计费预留已进入终态，不能重复预留')
        }
        return { reservationId: existing.id, quotaId: quota.id, reservedUnits: existing.reservedUnits, version: quota.version }
      }

      const available = quota.grantedUnits - quota.usedUnits - quota.reservedUnits
      if (available < input.units) throw new HttpException('计费额度不足，请升级套餐或稍后再试', HttpStatus.PAYMENT_REQUIRED)
      const updated = await tx.userTokenQuota.updateMany({
        where: { id: quota.id, userId: input.userId, version: quota.version },
        data: { reservedUnits: { increment: input.units }, version: { increment: 1 } },
      })
      if (updated.count !== 1) throw new QuotaConcurrencyError('计费额度发生并发更新，请重试')
      const reservation = await tx.tokenQuotaReservation.create({
        data: {
          userId: input.userId,
          quotaId: quota.id,
          generationId: input.generationId,
          reservedUnits: input.units,
          metadata: input.metadata,
        },
      })
      await tx.tokenQuotaEvent.create({
        data: {
          userId: input.userId,
          quotaId: quota.id,
          generationId: input.generationId,
          type: TokenQuotaEventType.RESERVE,
          units: -input.units,
          balanceBefore: available,
          balanceAfter: available - input.units,
          idempotencyKey: this.eventKey(reservation.id, 'reserve'),
          metadata: input.metadata,
        },
      })
      return { reservationId: reservation.id, quotaId: quota.id, reservedUnits: input.units, version: quota.version + 1 }
    })
  }

  async increase(input: {
    userId: string
    generationId: string
    reservations: QuotaReservationRef[]
    units: bigint
    idempotencyKey: string
    metadata?: Prisma.InputJsonValue
  }) {
    if (input.units <= 0n || !input.reservations.length) return { increasedUnits: 0n }
    const idempotencyKey = input.idempotencyKey.trim()
    if (!idempotencyKey) throw new ConflictException('增量预留缺少幂等键')
    const executionLease = currentOutboundExecutionLease()
    return this.serializable(async (tx) => {
      if (executionLease) await this.assertActiveExecutionLease(tx, input.generationId, executionLease)
      const rows = []
      let completed = 0
      for (const reference of input.reservations) {
        const reservation = await this.findReservation(tx, {
          reservationId: reference.reservationId,
          generationId: input.generationId,
          quotaId: reference.quotaId,
        })
        if (!reservation) throw new ConflictException('计费预留不存在')
        this.assertReservationOwner(reservation, {
          reservationId: reference.reservationId,
          userId: input.userId,
          generationId: input.generationId,
          quotaId: reference.quotaId,
        })
        if (reservation.status !== TokenQuotaReservationStatus.RESERVED) {
          throw new ConflictException('计费预留已进入终态，不能增加预留')
        }
        const eventIdempotencyKey = this.eventKey(reservation.id, `reserve:${idempotencyKey}`)
        const existingEvent = await tx.tokenQuotaEvent.findUnique({
          where: { idempotencyKey: eventIdempotencyKey },
          select: { id: true, units: true },
        })
        if (existingEvent) {
          // Idempotency keys identify the increment amount as well as the
          // reservation. Reusing a key with a different amount must fail
          // closed instead of silently reporting success.
          if (existingEvent.units !== -input.units) {
            throw new ConflictException('增量预留幂等键对应的金额不一致')
          }
          completed += 1
        }
        rows.push({ reservation, eventIdempotencyKey, existingEvent: Boolean(existingEvent) })
      }
      if (completed === rows.length) return { increasedUnits: input.units }
      if (completed > 0) throw new ConflictException('增量预留幂等状态不完整')

      // A caller must not apply the same increment twice under different
      // references. Apart from being ambiguous, duplicate rows would race
      // the same reservation and create an inconsistent hold.
      if (new Set(rows.map((row) => row.reservation.id)).size !== rows.length) {
        throw new ConflictException('增量预留包含重复的计费预留')
      }

      for (const row of rows) {
        const quota = await tx.userTokenQuota.findUniqueOrThrow({ where: { id: row.reservation.quotaId } })
        if (quota.userId !== input.userId) throw new ConflictException('计费预留归属校验失败')
        const available = quota.grantedUnits - quota.usedUnits - quota.reservedUnits
        if (available < input.units) throw new HttpException('计费额度不足，请升级套餐或稍后再试', HttpStatus.PAYMENT_REQUIRED)
        const updatedQuota = await tx.userTokenQuota.updateMany({
          where: { id: quota.id, userId: input.userId, version: quota.version },
          data: { reservedUnits: { increment: input.units }, version: { increment: 1 } },
        })
        if (updatedQuota.count !== 1) throw new QuotaConcurrencyError('计费额度发生并发更新，请重试')
        const updatedReservation = await tx.tokenQuotaReservation.updateMany({
          where: {
            id: row.reservation.id,
            userId: input.userId,
            generationId: input.generationId,
            quotaId: row.reservation.quotaId,
            status: TokenQuotaReservationStatus.RESERVED,
          },
          data: { reservedUnits: { increment: input.units } },
        })
        if (updatedReservation.count !== 1) throw new QuotaConcurrencyError('计费预留状态发生并发更新，请重试')
        await tx.tokenQuotaEvent.create({
          data: {
            userId: input.userId,
            quotaId: quota.id,
            generationId: input.generationId,
            type: TokenQuotaEventType.RESERVE,
            units: -input.units,
            balanceBefore: available,
            balanceAfter: available - input.units,
            idempotencyKey: row.eventIdempotencyKey,
            metadata: input.metadata,
          },
        })
      }
      return { increasedUnits: input.units }
    })
  }

  async settle(input: QuotaSettlementInput) {
    const [result] = await this.settleMany([input])
    return result
  }

  async settleMany(inputs: QuotaSettlementInput[]) {
    if (!inputs.length) return []
    return this.serializable((tx) => this.settleManyInTransaction(tx, inputs))
  }

  async settleGeneration(input: {
    userId?: string
    generationId: string
    reservations: QuotaSettlementInput[]
    ledger: TokenUsageLedgerInput
    detailLedgers?: TokenUsageLedgerInput[]
  }) {
    const executionLease = currentOutboundExecutionLease()
    const userId = input.userId || input.ledger.userId
    const detailLedgers = input.detailLedgers || []
    const ledgers = [input.ledger, ...detailLedgers]
    if (input.ledger.quotaId && !input.reservations.length) {
      throw new ConflictException('额度账本缺少对应的计费预留')
    }
    if (detailLedgers.some((ledger) => ledger.chargedUnits !== 0n
      || (ledger.reservedUnits || 0n) !== 0n
      || ledger.quotaId !== null)) {
      throw new ConflictException('用量明细账本不能产生额外财务影响')
    }
    if (new Set(ledgers.map((ledger) => ledger.idempotencyKey)).size !== ledgers.length) {
      throw new ConflictException('账本幂等键重复')
    }
    if (ledgers.some((ledger) => ledger.userId !== userId || ledger.generationId !== input.generationId)) {
      throw new ConflictException('账本归属与生成任务不一致')
    }
    if (input.reservations.some((reservation) => reservation.userId !== userId || reservation.generationId !== input.generationId)) {
      throw new ConflictException('计费预留归属与生成任务不一致')
    }
    return this.serializable(async (tx) => {
      const job = await tx.generationJob.findUnique({
        where: { id: input.generationId },
        select: { userId: true, status: true, settlementStatus: true, lockedBy: true, leaseVersion: true, leaseExpiresAt: true },
      })
      if (!job || job.userId !== userId) throw new ConflictException('生成任务与计费用户不一致')
      if (executionLease) this.assertExecutionLease(job, executionLease)
      if (job.settlementStatus === GenerationSettlementStatus.SETTLED) {
        for (const entry of ledgers) {
          const ledger = await tx.tokenUsageLedger.findUnique({
            where: { idempotencyKey: entry.idempotencyKey },
            select: { id: true },
          })
          if (!ledger) throw new ConflictException('任务已结算但账本记录不完整')
        }
        return { settlements: [], idempotent: true }
      }
      if (job.status !== 'RUNNING' || !['PENDING', 'RESERVED', 'RECONCILING'].includes(job.settlementStatus)) {
        throw new ConflictException('生成任务当前状态不允许结算')
      }

      const databaseReservations = await tx.tokenQuotaReservation.findMany({
        where: { userId, generationId: input.generationId },
        select: { id: true, quotaId: true, status: true },
      })
      const quotaSettlement = input.ledger.quotaId !== null && input.ledger.quotaId !== undefined
      if (quotaSettlement) {
        if (!databaseReservations.length
          || databaseReservations.length !== input.reservations.length
          || databaseReservations.some((reservation) => reservation.status !== TokenQuotaReservationStatus.RESERVED)) {
          throw new ConflictException('额度结算未覆盖任务的完整计费预留')
        }
        const uniqueQuotaIds = new Set(input.reservations.map((reservation) => reservation.quotaId))
        if (!input.reservations.some((reservation) => reservation.quotaId === input.ledger.quotaId)
          || uniqueQuotaIds.size !== input.reservations.length
          || input.reservations.some((reservation) => reservation.chargedUnits !== input.ledger.chargedUnits)
          || databaseReservations.some((databaseReservation) => !input.reservations.some((reservation) => reservation.quotaId === databaseReservation.quotaId
            && (!reservation.reservationId || reservation.reservationId === databaseReservation.id)))) {
          throw new ConflictException('额度结算预留集合或金额不一致')
        }
      } else {
        if (input.reservations.length) throw new ConflictException('非额度账本不能结算计费预留')
        if (databaseReservations.some((reservation) => reservation.status === TokenQuotaReservationStatus.RESERVED
          || reservation.status === TokenQuotaReservationStatus.SETTLED)) {
          throw new ConflictException('非额度结算仍存在活动或已结算的计费预留')
        }
      }

      const settlements = await this.settleManyInTransaction(tx, input.reservations)
      for (const entry of ledgers) {
        await tx.tokenUsageLedger.upsert({
          where: { idempotencyKey: entry.idempotencyKey },
          create: tokenUsageLedgerData(entry),
          update: {},
        })
      }
      const updated = await tx.generationJob.updateMany({
        where: {
          id: input.generationId,
          userId,
          status: 'RUNNING',
          settlementStatus: { in: ['PENDING', 'RESERVED', 'RECONCILING'] },
          ...(executionLease ? {
            lockedBy: executionLease.workerId,
            leaseVersion: executionLease.leaseVersion,
            leaseExpiresAt: { gt: new Date() },
          } : {}),
        },
        data: { settlementStatus: GenerationSettlementStatus.SETTLED },
      })
      if (updated.count !== 1) throw new ConflictException('生成任务状态发生并发更新，结算已回滚')
      return { settlements, idempotent: false }
    })
  }

  async release(input: {
    reservationId?: string
    userId: string
    quotaId: string
    generationId: string
    reservedUnits?: bigint
    metadata?: Prisma.InputJsonValue
  }) {
    return this.serializable(async (tx) => {
      const reservation = await this.findReservation(tx, input)
      if (!reservation) return { releasedUnits: 0n }
      this.assertReservationOwner(reservation, input)
      if (reservation.status === TokenQuotaReservationStatus.RELEASED) return { releasedUnits: reservation.reservedUnits }
      if (reservation.status !== TokenQuotaReservationStatus.RESERVED) return { releasedUnits: 0n }

      const quota = await tx.userTokenQuota.findUniqueOrThrow({ where: { id: reservation.quotaId } })
      if (quota.userId !== input.userId || quota.reservedUnits < reservation.reservedUnits) {
        throw new ConflictException('计费预留汇总不一致，拒绝释放')
      }
      const updatedQuota = await tx.userTokenQuota.updateMany({
        where: { id: quota.id, userId: input.userId, version: quota.version },
        data: { reservedUnits: { decrement: reservation.reservedUnits }, version: { increment: 1 } },
      })
      if (updatedQuota.count !== 1) throw new QuotaConcurrencyError('计费额度发生并发更新，请重试')
      const updatedReservation = await tx.tokenQuotaReservation.updateMany({
        where: {
          id: reservation.id,
          userId: input.userId,
          generationId: input.generationId,
          quotaId: input.quotaId,
          status: TokenQuotaReservationStatus.RESERVED,
        },
        data: { status: TokenQuotaReservationStatus.RELEASED, releasedAt: new Date() },
      })
      if (updatedReservation.count !== 1) throw new QuotaConcurrencyError('计费预留状态发生并发更新，请重试')
      const balance = quota.grantedUnits - quota.usedUnits - quota.reservedUnits
      await tx.tokenQuotaEvent.upsert({
        where: { idempotencyKey: this.eventKey(reservation.id, 'release') },
        create: {
          userId: input.userId,
          quotaId: quota.id,
          generationId: input.generationId,
          type: TokenQuotaEventType.RELEASE,
          units: reservation.reservedUnits,
          balanceBefore: balance,
          balanceAfter: balance + reservation.reservedUnits,
          idempotencyKey: this.eventKey(reservation.id, 'release'),
          metadata: input.metadata,
        },
        update: {},
      })
      return { releasedUnits: reservation.reservedUnits }
    })
  }

  async summary(userId: string, scopePrefix?: string): Promise<QuotaSummary[]> {
    const now = new Date()
    const rows = await this.prisma.userTokenQuota.findMany({
      where: { userId, periodEnd: { gt: now }, status: TokenQuotaStatus.ACTIVE, ...(scopePrefix ? { scopeKey: { startsWith: scopePrefix } } : {}) },
      orderBy: [{ periodEnd: 'asc' }, { scopeKey: 'asc' }],
    })
    return rows.map((row) => ({
      quotaId: row.id,
      scopeKey: row.scopeKey,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      grantedUnits: row.grantedUnits,
      reservedUnits: row.reservedUnits,
      usedUnits: row.usedUnits,
      remainingUnits: row.grantedUnits - row.usedUnits - row.reservedUnits,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cachedInputTokens: row.cachedInputTokens,
      reasoningTokens: row.reasoningTokens,
    }))
  }

  async events(userId: string, limit = 100) {
    return this.prisma.tokenQuotaEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, Math.trunc(limit))),
      select: { id: true, quotaId: true, generationId: true, type: true, units: true, balanceBefore: true, balanceAfter: true, metadata: true, createdAt: true },
    })
  }

  private assertExecutionLease(job: { status: string; lockedBy: string | null; leaseVersion: number; leaseExpiresAt: Date | null }, lease: OutboundExecutionLease) {
    if (job.status !== 'RUNNING'
      || job.lockedBy !== lease.workerId
      || job.leaseVersion !== lease.leaseVersion
      || !job.leaseExpiresAt
      || job.leaseExpiresAt.getTime() <= Date.now()) {
      throw new ConflictException('生成任务执行租约已失效，账务操作已拒绝')
    }
  }

  private async assertActiveExecutionLease(tx: Prisma.TransactionClient, generationId: string, lease: OutboundExecutionLease) {
    const job = await tx.generationJob.findUnique({
      where: { id: generationId },
      select: { status: true, lockedBy: true, leaseVersion: true, leaseExpiresAt: true },
    })
    if (!job) throw new ConflictException('生成任务不存在')
    this.assertExecutionLease(job, lease)
  }

  private async settleManyInTransaction(tx: Prisma.TransactionClient, inputs: QuotaSettlementInput[]) {
    const results: Array<{ chargedUnits: bigint; releasedUnits: bigint; extraUnits: bigint }> = []
    for (const input of inputs) {
      const reservation = await this.findReservation(tx, input)
      if (!reservation) throw new ConflictException('计费预留不存在')
      this.assertReservationOwner(reservation, input)
      const charge = input.chargedUnits < 0n ? 0n : input.chargedUnits
      if (reservation.status === TokenQuotaReservationStatus.SETTLED) {
        if (reservation.chargedUnits !== charge) throw new ConflictException('重复结算金额与原结算不一致')
        results.push({
          chargedUnits: charge,
          releasedUnits: reservation.reservedUnits > charge ? reservation.reservedUnits - charge : 0n,
          extraUnits: charge > reservation.reservedUnits ? charge - reservation.reservedUnits : 0n,
        })
        continue
      }
      if (reservation.status !== TokenQuotaReservationStatus.RESERVED) {
        throw new ConflictException('已释放的计费预留不能结算')
      }

      const quota = await tx.userTokenQuota.findUniqueOrThrow({ where: { id: reservation.quotaId } })
      if (quota.userId !== input.userId || quota.reservedUnits < reservation.reservedUnits) {
        throw new ConflictException('计费预留汇总不一致，拒绝结算')
      }
      const released = reservation.reservedUnits > charge ? reservation.reservedUnits - charge : 0n
      const extra = charge > reservation.reservedUnits ? charge - reservation.reservedUnits : 0n
      const available = quota.grantedUnits - quota.usedUnits - quota.reservedUnits
      if (extra > available) throw new HttpException('实际计费额度超过可用额度', HttpStatus.PAYMENT_REQUIRED)
      const updatedQuota = await tx.userTokenQuota.updateMany({
        where: { id: quota.id, userId: input.userId, version: quota.version },
        data: {
          reservedUnits: { decrement: reservation.reservedUnits },
          usedUnits: { increment: charge },
          inputTokens: { increment: BigInt(Math.max(0, Math.trunc(input.inputTokens))) },
          outputTokens: { increment: BigInt(Math.max(0, Math.trunc(input.outputTokens))) },
          cachedInputTokens: { increment: BigInt(Math.max(0, Math.trunc(input.cachedInputTokens || 0))) },
          reasoningTokens: { increment: BigInt(Math.max(0, Math.trunc(input.reasoningTokens || 0))) },
          version: { increment: 1 },
          status: TokenQuotaStatus.ACTIVE,
        },
      })
      if (updatedQuota.count !== 1) throw new QuotaConcurrencyError('计费额度发生并发更新，请重试')
      const updatedReservation = await tx.tokenQuotaReservation.updateMany({
        where: {
          id: reservation.id,
          userId: input.userId,
          generationId: input.generationId,
          quotaId: input.quotaId,
          status: TokenQuotaReservationStatus.RESERVED,
        },
        data: { status: TokenQuotaReservationStatus.SETTLED, chargedUnits: charge, settledAt: new Date() },
      })
      if (updatedReservation.count !== 1) throw new QuotaConcurrencyError('计费预留状态发生并发更新，请重试')

      if (released > 0n) {
        await tx.tokenQuotaEvent.upsert({
          where: { idempotencyKey: this.eventKey(reservation.id, 'release') },
          create: {
            userId: input.userId,
            quotaId: quota.id,
            generationId: input.generationId,
            type: TokenQuotaEventType.RELEASE,
            units: released,
            balanceBefore: available,
            balanceAfter: available + released,
            idempotencyKey: this.eventKey(reservation.id, 'release'),
            metadata: input.metadata,
          },
          update: {},
        })
      }
      await tx.tokenQuotaEvent.upsert({
        where: { idempotencyKey: this.eventKey(reservation.id, 'charge') },
        create: {
          userId: input.userId,
          quotaId: quota.id,
          generationId: input.generationId,
          type: TokenQuotaEventType.CHARGE,
          units: -charge,
          balanceBefore: available + released,
          balanceAfter: available + released - extra,
          idempotencyKey: this.eventKey(reservation.id, 'charge'),
          metadata: input.metadata,
        },
        update: {},
      })
      results.push({ chargedUnits: charge, releasedUnits: released, extraUnits: extra })
    }
    return results
  }

  private findReservation(
    tx: Prisma.TransactionClient,
    input: { reservationId?: string; generationId: string; quotaId: string },
  ) {
    return input.reservationId
      ? tx.tokenQuotaReservation.findUnique({ where: { id: input.reservationId } })
      : tx.tokenQuotaReservation.findUnique({ where: { generationId_quotaId: { generationId: input.generationId, quotaId: input.quotaId } } })
  }

  private assertReservationOwner(
    reservation: { id: string; userId: string; quotaId: string; generationId: string },
    input: { reservationId?: string; userId: string; quotaId: string; generationId: string },
  ) {
    if ((input.reservationId && reservation.id !== input.reservationId)
      || reservation.userId !== input.userId
      || reservation.quotaId !== input.quotaId
      || reservation.generationId !== input.generationId) {
      throw new ConflictException('计费预留归属校验失败')
    }
  }
}
