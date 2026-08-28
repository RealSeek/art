import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Observable } from 'rxjs'

export type RequestContext = {
  requestId: string
  traceId: string
}

export type ContextRequest = {
  headers?: Record<string, string | string[] | undefined>
  requestId?: string
  traceId?: string
}

const firstHeader = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const validId = (value: string | undefined): value is string => Boolean(value && /^[A-Za-z0-9._:-]{1,128}$/.test(value))

export const requestContextOf = (request: ContextRequest): RequestContext => ({
  requestId: request.requestId || randomUUID(),
  traceId: request.traceId || randomUUID(),
})

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<ContextRequest>()
    const reply = http.getResponse<{ header?: (name: string, value: string) => void }>()
    const requestIdHeader = firstHeader(request.headers?.['x-request-id'])
    const traceIdHeader = firstHeader(request.headers?.['x-trace-id'])
    const requestId: string = validId(requestIdHeader) ? requestIdHeader : randomUUID()
    const traceId: string = validId(traceIdHeader) ? traceIdHeader : requestId
    request.requestId = requestId
    request.traceId = traceId
    reply.header?.('x-request-id', requestId)
    reply.header?.('x-trace-id', traceId)
    return next.handle()
  }
}
