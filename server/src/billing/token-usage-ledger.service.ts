import { Injectable } from '@nestjs/common'
import { Prisma, TokenLedgerType, TokenSettlementStatus, TokenUsageSource } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TokenUsageLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: { userId: string; generationId: string; quotaId?: string | null; subscriptionId?: string | null; model: string; provider?: string | null; providerRequestId?: string | null; providerAttemptId?: string | null; inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number; reservedUnits?: bigint; chargedUnits: bigint; inputRate: number; outputRate: number; pricingSnapshot: Prisma.InputJsonValue; usageSource: TokenUsageSource; settlementStatus: TokenSettlementStatus; type: TokenLedgerType; idempotencyKey: string }) {
    return this.prisma.tokenUsageLedger.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: { ...input, inputTokens: Math.max(0, Math.trunc(input.inputTokens)), outputTokens: Math.max(0, Math.trunc(input.outputTokens)), cachedInputTokens: Math.max(0, Math.trunc(input.cachedInputTokens || 0)), reasoningTokens: Math.max(0, Math.trunc(input.reasoningTokens || 0)), reservedUnits: input.reservedUnits || 0n },
      update: {},
    })
  }
}
