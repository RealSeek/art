import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Prisma, TokenQuotaEventType, TokenQuotaStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type QuotaReservation = { quotaId: string; reservedUnits: bigint; version: number }
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

  private eventKey(generationId: string | undefined, action: string, quotaId: string) {
    return `generation:${generationId || 'unknown'}:quota:${quotaId}:${action}`
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        lastError = error
        const retryable = error instanceof ConflictException || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        if (!retryable) throw error
      }
    }
    throw lastError
  }

  async reserve(input: { userId: string; subscriptionId?: string | null; scopeKey: string; periodStart: Date; periodEnd: Date; grantedUnits: bigint; units: bigint; generationId?: string; metadata?: Prisma.InputJsonValue }): Promise<QuotaReservation | null> {
    if (input.units <= 0n || input.grantedUnits <= 0n) return null
    return this.serializable(async (tx) => {
      const quota = await tx.userTokenQuota.upsert({
        where: { userId_scopeKey_periodStart: { userId: input.userId, scopeKey: input.scopeKey, periodStart: input.periodStart } },
        create: { userId: input.userId, subscriptionId: input.subscriptionId || null, scopeKey: input.scopeKey, periodStart: input.periodStart, periodEnd: input.periodEnd, grantedUnits: input.grantedUnits },
        update: {},
      })
      const available = quota.grantedUnits - quota.usedUnits - quota.reservedUnits
      if (available < input.units) throw new HttpException('文字额度不足，请升级套餐或稍后再试', HttpStatus.PAYMENT_REQUIRED)
      const updated = await tx.userTokenQuota.updateMany({ where: { id: quota.id, version: quota.version }, data: { reservedUnits: { increment: input.units }, version: { increment: 1 } } })
      if (updated.count !== 1) throw new ConflictException('文字额度发生并发更新，请重试')
      const after = available - input.units
      await tx.tokenQuotaEvent.create({ data: { userId: input.userId, quotaId: quota.id, generationId: input.generationId, type: TokenQuotaEventType.RESERVE, units: -input.units, balanceBefore: available, balanceAfter: after, idempotencyKey: this.eventKey(input.generationId, 'reserve', quota.id), metadata: input.metadata } })
      return { quotaId: quota.id, reservedUnits: input.units, version: quota.version + 1 }
    })
  }

  async settle(input: { userId: string; quotaId: string; generationId: string; reservedUnits: bigint; chargedUnits: bigint; inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number; metadata?: Prisma.InputJsonValue }) {
    const [result] = await this.settleMany([input])
    return result
  }

  async settleMany(inputs: Array<{ userId: string; quotaId: string; generationId: string; reservedUnits: bigint; chargedUnits: bigint; inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number; metadata?: Prisma.InputJsonValue }>) {
    if (!inputs.length) return []
    return this.serializable(async (tx) => {
      const results = []
      for (const input of inputs) {
        const chargeKey = this.eventKey(input.generationId, 'charge', input.quotaId)
        const existing = await tx.tokenQuotaEvent.findUnique({ where: { idempotencyKey: chargeKey }, select: { id: true } })
        if (existing) {
          results.push({ chargedUnits: input.chargedUnits, releasedUnits: input.reservedUnits > input.chargedUnits ? input.reservedUnits - input.chargedUnits : 0n, extraUnits: 0n })
          continue
        }
      const quota = await tx.userTokenQuota.findUniqueOrThrow({ where: { id: input.quotaId } })
      const charge = input.chargedUnits < 0n ? 0n : input.chargedUnits
      const released = input.reservedUnits > charge ? input.reservedUnits - charge : 0n
      const extra = charge > input.reservedUnits ? charge - input.reservedUnits : 0n
      const available = quota.grantedUnits - quota.usedUnits - quota.reservedUnits
      if (extra > available) throw new HttpException('实际文字用量超过剩余额度', HttpStatus.PAYMENT_REQUIRED)
      const updated = await tx.userTokenQuota.updateMany({ where: { id: quota.id, version: quota.version }, data: { reservedUnits: { decrement: input.reservedUnits > quota.reservedUnits ? quota.reservedUnits : input.reservedUnits }, usedUnits: { increment: charge }, inputTokens: { increment: BigInt(Math.max(0, input.inputTokens)) }, outputTokens: { increment: BigInt(Math.max(0, input.outputTokens)) }, cachedInputTokens: { increment: BigInt(Math.max(0, input.cachedInputTokens || 0)) }, reasoningTokens: { increment: BigInt(Math.max(0, input.reasoningTokens || 0)) }, version: { increment: 1 }, status: TokenQuotaStatus.ACTIVE } })
      if (updated.count !== 1) throw new ConflictException('文字额度发生并发更新，请重试')
      if (released > 0n) await tx.tokenQuotaEvent.create({ data: { userId: input.userId, quotaId: quota.id, generationId: input.generationId, type: TokenQuotaEventType.RELEASE, units: released, balanceBefore: available, balanceAfter: available + released, idempotencyKey: this.eventKey(input.generationId, 'release', quota.id), metadata: input.metadata } })
      await tx.tokenQuotaEvent.create({ data: { userId: input.userId, quotaId: quota.id, generationId: input.generationId, type: TokenQuotaEventType.CHARGE, units: -charge, balanceBefore: available + released, balanceAfter: available + released - extra, idempotencyKey: chargeKey, metadata: input.metadata } })
        results.push({ chargedUnits: charge, releasedUnits: released, extraUnits: extra })
      }
      return results
    })
  }

  async release(input: { userId: string; quotaId: string; generationId: string; reservedUnits: bigint; metadata?: Prisma.InputJsonValue }) {
    const releaseKey = this.eventKey(input.generationId, 'release', input.quotaId)
    const existing = await this.prisma.tokenQuotaEvent.findUnique({ where: { idempotencyKey: releaseKey }, select: { id: true } })
    if (existing) return { releasedUnits: input.reservedUnits }
    return this.serializable(async (tx) => {
      const quota = await tx.userTokenQuota.findUniqueOrThrow({ where: { id: input.quotaId } })
      const released = input.reservedUnits > quota.reservedUnits ? quota.reservedUnits : input.reservedUnits
      if (released <= 0n) return { releasedUnits: 0n }
      const updated = await tx.userTokenQuota.updateMany({ where: { id: quota.id, version: quota.version }, data: { reservedUnits: { decrement: released }, version: { increment: 1 } } })
      if (updated.count !== 1) throw new ConflictException('文字额度发生并发更新，请重试')
      const balance = quota.grantedUnits - quota.usedUnits - quota.reservedUnits
      await tx.tokenQuotaEvent.create({ data: { userId: input.userId, quotaId: quota.id, generationId: input.generationId, type: TokenQuotaEventType.RELEASE, units: released, balanceBefore: balance, balanceAfter: balance + released, idempotencyKey: releaseKey, metadata: input.metadata } })
      return { releasedUnits: released }
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
      where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(500, Math.max(1, Math.trunc(limit))),
      select: { id: true, quotaId: true, generationId: true, type: true, units: true, balanceBefore: true, balanceAfter: true, metadata: true, createdAt: true },
    })
  }
}
