import { Controller, Get } from '@nestjs/common'
import { PrismaService } from './prisma/prisma.service'
import { RuntimeMetricsService } from './common/runtime-metrics.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly metrics: RuntimeMetricsService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`
    return { ok: true, service: 'flux-studio-api', timestamp: new Date().toISOString() }
  }

  @Get('metrics')
  metricsSnapshot() {
    return this.metrics.snapshot()
  }
}
