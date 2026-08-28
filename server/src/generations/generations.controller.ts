import { BadRequestException, Body, Controller, Get, MessageEvent, Param, Post, Query, Req, Sse, UseGuards } from '@nestjs/common'
import { JobKind } from '@prisma/client'
import { IsEnum, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Observable, distinctUntilChanged, from, interval, map, startWith, switchMap, takeWhile } from 'rxjs'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedRequest, AuthenticatedUser } from '../common/request-user'
import { GenerationsService } from './generations.service'

class CreateJobDto {
  @IsEnum(JobKind) kind!: JobKind
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(20_000) prompt!: string
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(160) model?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) projectId?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) conversationId?: string
  @IsObject() options!: Record<string, unknown>
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) idempotencyKey?: string
}

@Controller('generations')
@UseGuards(AuthGuard)
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Body() body: CreateJobDto) { return this.generations.create(user.id, body, { requestId: request.requestId, traceId: request.traceId }) }
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query('kind') kind?: JobKind) {
    if (kind && !Object.values(JobKind).includes(kind)) throw new BadRequestException('任务类型无效')
    return this.generations.list(user.id, kind)
  }
  @Get(':id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.generations.get(user.id, id) }
  @Get(':id/events/history') history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.generations.events(user.id, id) }
  @Post(':id/cancel') cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.generations.cancel(user.id, id) }
  @Post(':id/retry') retry(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.generations.retry(user.id, id, { requestId: request.requestId, traceId: request.traceId }) }
  @Sse(':id/events') events(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Observable<MessageEvent> {
    const reasoningOf = (job: { stream?: { metadata?: unknown } | null }) => {
      const metadata = job.stream?.metadata
      return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).reasoning
        : undefined
    }
    const webSearchOf = (job: { stream?: { metadata?: unknown } | null }) => {
      const metadata = job.stream?.metadata
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return ''
      const search = (metadata as Record<string, unknown>).webSearch
      if (!search || typeof search !== 'object' || Array.isArray(search)) return ''
      const row = search as Record<string, unknown>
      const queries = Array.isArray(row.queries) ? row.queries.join('|') : ''
      const sources = Array.isArray(row.sources) ? row.sources.map((source) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) return ''
        const item = source as Record<string, unknown>
        return `${String(item.url || '')}:${String(item.title || '')}`
      }).join('|') : ''
      return `${String(row.status || '')}:${queries}:${sources}:${String(row.error || '')}`
    }
    return interval(200).pipe(
      startWith(0),
      switchMap(() => from(this.generations.get(user.id, id))),
      distinctUntilChanged((a, b) => a.status === b.status
        && a.stream?.content === b.stream?.content
        && reasoningOf(a) === reasoningOf(b)
        && webSearchOf(a) === webSearchOf(b)),
      map((job) => ({ type: 'job', id: job.id, data: job })),
      takeWhile((event) => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(event.data.status), true),
    )
  }
}
