import { Injectable } from '@nestjs/common'
import { Prisma, GenerationEvent } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type GenerationEventType = 'queued' | 'requeued' | 'running' | 'thought' | 'thinking_delta' | 'retrieval' | 'tool_call' | 'tool_result' | 'tool_loop' | 'content' | 'text_delta' | 'usage' | 'preview' | 'artifact' | 'error' | 'done' | 'cancelled'

@Injectable()
export class GenerationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async append(generationId: string, type: GenerationEventType, payload?: unknown): Promise<GenerationEvent> {
    // Sequence allocation is intentionally retried: a read-then-insert pair
    // can race when lifecycle and runner events are emitted concurrently.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await this.prisma.generationEvent.findFirst({ where: { generationId }, orderBy: { sequence: 'desc' }, select: { sequence: true } })
      try {
        return await this.prisma.generationEvent.create({ data: { generationId, sequence: (latest?.sequence ?? 0) + 1, type, payload: payload === undefined ? undefined : payload as Prisma.InputJsonValue } })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || attempt === 4) throw error
      }
    }
    throw new Error('无法分配生成事件序号')
  }

  list(generationId: string, limit = 200) {
    return this.prisma.generationEvent.findMany({ where: { generationId }, orderBy: { sequence: 'asc' }, take: Math.min(Math.max(1, limit), 500) })
  }

  listAfter(generationId: string, sequence: number, limit = 200) {
    return this.prisma.generationEvent.findMany({ where: { generationId, sequence: { gt: Math.max(0, Math.trunc(sequence)) } }, orderBy: { sequence: 'asc' }, take: Math.min(Math.max(1, limit), 500) })
  }
}
