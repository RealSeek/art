import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'

type DependencyStatus = { status: 'up' | 'down'; latencyMs: number }

export type ReadinessSnapshot = {
  ok: boolean
  service: string
  dependencies: {
    database: DependencyStatus
    redis: DependencyStatus
    bullmq: DependencyStatus
  }
  timestamp: string
}

@Injectable()
export class ReadinessService {
  private readonly timeoutMs = Math.max(500, Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 3000))

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('generation') private readonly generationQueue: Queue,
  ) {}

  async check(): Promise<ReadinessSnapshot> {
    const [database, redis, bullmq] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(async () => {
        const client = await this.generationQueue.client as unknown as { ping(): Promise<string> }
        if (await client.ping() !== 'PONG') throw new Error('Redis ping failed')
      }),
      this.probe(() => this.generationQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'paused')),
    ])
    return {
      ok: [database, redis, bullmq].every((dependency) => dependency.status === 'up'),
      service: 'flux-studio-api',
      dependencies: { database, redis, bullmq },
      timestamp: new Date().toISOString(),
    }
  }

  private async probe(check: () => Promise<unknown>): Promise<DependencyStatus> {
    const startedAt = Date.now()
    try {
      await this.withTimeout(check())
      return { status: 'up', latencyMs: Date.now() - startedAt }
    } catch {
      return { status: 'down', latencyMs: Date.now() - startedAt }
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Readiness probe timed out')), this.timeoutMs)
      operation.then(
        (value) => { clearTimeout(timer); resolve(value) },
        (error) => { clearTimeout(timer); reject(error) },
      )
    })
  }
}
