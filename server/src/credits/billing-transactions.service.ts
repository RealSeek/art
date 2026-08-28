import { Injectable, Logger } from '@nestjs/common'
import { BillingTransactionDirection, BillingTransactionType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type BillingTransactionInput = {
  userId: string
  generationId?: string
  amount: number
  provider?: string
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  upstreamCostMicros?: number
  idempotencyKey: string
  metadata?: Prisma.InputJsonValue
}

@Injectable()
export class BillingTransactionsService {
  private readonly logger = new Logger(BillingTransactionsService.name)

  constructor(private readonly prisma: PrismaService) {}

  recordPreAuth(input: BillingTransactionInput) {
    return this.record(BillingTransactionType.PRE_AUTH, BillingTransactionDirection.DEBIT, input)
  }

  recordCapture(input: BillingTransactionInput) {
    return this.record(BillingTransactionType.CAPTURE, BillingTransactionDirection.DEBIT, input)
  }

  recordRefund(input: BillingTransactionInput) {
    return this.record(BillingTransactionType.REFUND, BillingTransactionDirection.CREDIT, input)
  }

  async safely(operation: Promise<unknown>, context: string) {
    try { await operation } catch (error) {
      this.logger.error(`Billing audit write failed (${context}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async record(type: BillingTransactionType, direction: BillingTransactionDirection, input: BillingTransactionInput) {
    if (!Number.isInteger(input.amount) || input.amount < 0) throw new Error('Billing transaction amount must be a non-negative integer')
    return this.prisma.billingTransaction.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        userId: input.userId,
        generationId: input.generationId,
        type,
        direction,
        amount: input.amount,
        provider: input.provider,
        inputTokens: this.nonNegativeInteger(input.inputTokens),
        outputTokens: this.nonNegativeInteger(input.outputTokens),
        cachedInputTokens: this.nonNegativeInteger(input.cachedInputTokens),
        reasoningTokens: this.nonNegativeInteger(input.reasoningTokens),
        upstreamCostMicros: this.nonNegativeInteger(input.upstreamCostMicros),
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      },
    })
  }

  private nonNegativeInteger(value?: number) {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value!)) : 0
  }
}
