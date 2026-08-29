import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Observable, catchError, finalize, throwError } from 'rxjs'
import { RuntimeMetricsService } from './runtime-metrics.service'

export type RequestContext = {
  requestId: string
  traceId: string
}

export type ContextRequest = {
  headers?: Record<string, string | string[] | undefined>
  method?: string
  url?: string
  requestId?: string
  traceId?: string
}

type ContextReply = { header?: (name: string, value: string) => void; statusCode?: number }

const firstHeader = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const validId = (value: string | undefined): value is string => Boolean(value && /^[A-Za-z0-9._:-]{1,128}$/.test(value))

export const requestContextOf = (request: ContextRequest): RequestContext => ({
  requestId: request.requestId || randomUUID(),
  traceId: request.traceId || randomUUID(),
})

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly metrics: RuntimeMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<ContextRequest>()
    const reply = http.getResponse<ContextReply>()
    const requestIdHeader = firstHeader(request.headers?.['x-request-id'])
    const traceIdHeader = firstHeader(request.headers?.['x-trace-id'])
    const requestId: string = validId(requestIdHeader) ? requestIdHeader : randomUUID()
    const traceId: string = validId(traceIdHeader) ? traceIdHeader : requestId
    request.requestId = requestId
    request.traceId = traceId
    reply.header?.('x-request-id', requestId)
    reply.header?.('x-trace-id', traceId)
    const startedAt = Date.now()
    let recorded = false
    const record = (fallbackStatus: number) => {
      if (recorded) return
      recorded = true
      const responseStatus = Number(reply.statusCode || 0)
      this.metrics.record(String(request.method || 'UNKNOWN'), String(request.url || 'unknown'), responseStatus >= 100 ? responseStatus : fallbackStatus, Date.now() - startedAt)
    }
    return next.handle().pipe(
      catchError((error: unknown) => {
        record(500)
        return throwError(() => error)
      }),
      finalize(() => {
        record(200)
      }),
    )
  }
}
