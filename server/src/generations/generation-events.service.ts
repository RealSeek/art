import { Injectable } from '@nestjs/common'
import { Prisma, GenerationEvent } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type GenerationEventType = 'queued' | 'requeued' | 'running' | 'thought' | 'retrieval' | 'tool_call' | 'tool_result' | 'content' | 'usage' | 'preview' | 'error' | 'done' | 'cancelled'

@Injectable()
export class GenerationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async append(generationId: string, type: GenerationEventType, payload?: unknown): Promise<GenerationEvent> {
    const latest = await this.prisma.generationEvent.findFirst({ where: { generationId }, orderBy: { sequence: 'desc' }, select: { sequence: true } })
    const sequence = (latest?.sequence ?? 0) + 1
    return this.prisma.generationEvent.create({ data: { generationId, sequence, type, payload: payload === undefined ? undefined : payload as Prisma.InputJsonValue } })
  }

  list(generationId: string, limit = 200) {
    return this.prisma.generationEvent.findMany({ where: { generationId }, orderBy: { sequence: 'asc' }, take: Math.min(Math.max(1, limit), 500) })
  }
}
