import { Injectable } from '@nestjs/common'

type RouteMetric = { requests: number; errors: number; totalDurationMs: number; lastStatus: number; lastAt: string }

/** Small bounded in-process metrics snapshot for health checks and local operations. */
@Injectable()
export class RuntimeMetricsService {
  private readonly startedAt = Date.now()
  private readonly routes = new Map<string, RouteMetric>()
  private totalRequests = 0
  private totalErrors = 0

  record(method: string, path: string, status: number, durationMs: number) {
    const key = `${method.toUpperCase()} ${path.split('?')[0].slice(0, 160)}`
    let metric = this.routes.get(key)
    if (!metric) {
      if (this.routes.size >= 200) this.routes.delete(this.routes.keys().next().value as string)
      metric = { requests: 0, errors: 0, totalDurationMs: 0, lastStatus: status, lastAt: new Date().toISOString() }
      this.routes.set(key, metric)
    }
    metric.requests += 1
    metric.errors += status >= 400 ? 1 : 0
    metric.totalDurationMs += Math.max(0, durationMs)
    metric.lastStatus = status
    metric.lastAt = new Date().toISOString()
    this.totalRequests += 1
    this.totalErrors += status >= 400 ? 1 : 0
  }

  snapshot() {
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      routes: [...this.routes.entries()].map(([route, metric]) => ({ route, ...metric, averageDurationMs: metric.requests ? Math.round(metric.totalDurationMs / metric.requests) : 0 })),
    }
  }
}
