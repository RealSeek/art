import { Injectable } from '@nestjs/common'
import Redis from 'ioredis'
import { PrismaService } from '../prisma/prisma.service'
import { AssetsService } from '../assets/assets.service'
import { BillingReconciliationService } from './billing-reconciliation.service'

type Probe = { status: 'healthy' | 'unhealthy'; latencyMs: number; message: string }

@Injectable()
export class AdminHealthService {
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService, private readonly reconciliation: BillingReconciliationService) {}

  async summary(): Promise<Record<string, unknown>> {
    const probe = async (check: () => Promise<unknown>): Promise<Probe> => {
      const started = Date.now()
      try { await check(); return { status: 'healthy', latencyMs: Date.now() - started, message: '' } }
      catch (error) { return { status: 'unhealthy', latencyMs: Date.now() - started, message: error instanceof Error ? error.message : '检查失败' } }
    }
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1, enableOfflineQueue: false })
    let storageInfo: Record<string, unknown> | null = null
    const [database, queue, storage, providers, generations, exports, alerts, reconciliation, memory] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(async () => { await redis.connect(); if (await redis.ping() !== 'PONG') throw new Error('Redis PING 未返回 PONG') }),
      probe(async () => { storageInfo = await this.assets.health() as Record<string, unknown>; if (storageInfo.writable !== true) throw new Error('存储目录不可写') }),
      this.prisma.providerChannel.groupBy({ by: ['lastHealthStatus'], where: { enabled: true }, _count: { _all: true } }).catch(() => []),
      this.prisma.generationJob.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
      this.prisma.exportJob.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
      this.prisma.alertEvent.groupBy({ by: ['status'], where: { status: { not: 'RESOLVED' } }, _count: { _all: true } }).catch(() => []),
      this.reconciliation.report('1').catch(() => ({ summary: { unavailable: true } })),
      Promise.resolve(process.memoryUsage()),
    ])
    redis.disconnect()
    const countMap = (rows: Array<{ status?: string | null; lastHealthStatus?: string | null; _count: { _all: number } }>) => Object.fromEntries(rows.map((row) => [row.status || row.lastHealthStatus || 'unknown', row._count._all]))
    const dependencyStorage = { ...storage, ...(storageInfo || {}) }
    return {
      api: { status: 'healthy', latencyMs: 0, message: '' },
      database,
      queue,
      storage: dependencyStorage,
      dependencies: { database, queue, storage: dependencyStorage },
      providers: countMap(providers),
      generations: countMap(generations),
      exports: countMap(exports),
      alerts: countMap(alerts),
      reconciliation: (reconciliation as { summary: unknown }).summary,
      runtime: { uptimeSeconds: Math.floor(process.uptime()), memoryRssBytes: memory.rss, heapUsedBytes: memory.heapUsed, nodeVersion: process.version, platform: process.platform },
      environment: process.env.NODE_ENV || 'development',
      checkedAt: new Date().toISOString(),
    }
  }
}
