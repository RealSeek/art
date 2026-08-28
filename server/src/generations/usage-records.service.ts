import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type UsageRecordInput = {
  generationId: string
  userId: string
  provider?: string | null
  providerId?: string | null
  model: string
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  imageCount?: number
  videoSeconds?: number
  upstreamCostMicros?: number
  metadata?: Prisma.InputJsonValue
}

@Injectable()
export class UsageRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: UsageRecordInput) {
    const integer = (value: number | undefined) => Math.max(0, Math.floor(Number(value || 0)))
    return this.prisma.usageRecord.upsert({
      where: { generationId: input.generationId },
      create: {
        generationId: input.generationId,
        userId: input.userId,
        provider: input.provider || null,
        providerId: input.providerId || null,
        model: input.model,
        inputTokens: integer(input.inputTokens),
        outputTokens: integer(input.outputTokens),
        cachedInputTokens: integer(input.cachedInputTokens),
        reasoningTokens: integer(input.reasoningTokens),
        imageCount: integer(input.imageCount),
        videoSeconds: integer(input.videoSeconds),
        upstreamCostMicros: integer(input.upstreamCostMicros),
        metadata: input.metadata,
      },
      update: {
        provider: input.provider || null,
        providerId: input.providerId || null,
        model: input.model,
        inputTokens: integer(input.inputTokens),
        outputTokens: integer(input.outputTokens),
        cachedInputTokens: integer(input.cachedInputTokens),
        reasoningTokens: integer(input.reasoningTokens),
        imageCount: integer(input.imageCount),
        videoSeconds: integer(input.videoSeconds),
        upstreamCostMicros: integer(input.upstreamCostMicros),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    })
  }
}
