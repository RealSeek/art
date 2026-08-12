import { Body, Controller, Delete, Get, MessageEvent, Param, Post, Sse, UseGuards } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Observable, distinctUntilChanged, from, interval, map, startWith, switchMap, takeWhile } from 'rxjs'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { AgentTasksService } from './agent-tasks.service'

class CreateAgentTaskDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(120) title!: string
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(20_000) goal!: string
  @IsOptional() @IsString() @MaxLength(20_000) instructions?: string
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(160) model!: string
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9:_-]+$/) @MaxLength(100) skillId?: string
  @IsOptional() @IsString() @MaxLength(100) assistantId?: string
  @IsOptional() @IsString() @MaxLength(100) projectId?: string
  @IsOptional() @IsString() @MaxLength(100) pluginId?: string
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) attachmentIds?: string[]
}

class ReviewAgentToolCallDto { @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED' }

@Controller('agent-tasks')
@UseGuards(AuthGuard)
export class AgentTasksController {
  constructor(private readonly tasks: AgentTasksService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.tasks.list(user.id) }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateAgentTaskDto) { return this.tasks.create(user.id, body) }
  @Get(':id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.get(user.id, id) }
  @Post(':id/run') run(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.run(user.id, id) }
  @Post(':id/cancel') cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.cancel(user.id, id) }
  @Post(':id/tool-calls/:callId/review') reviewToolCall(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('callId') callId: string, @Body() body: ReviewAgentToolCallDto) { return this.tasks.reviewToolCall(user.id, id, callId, body.decision) }
  @Delete(':id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.remove(user.id, id) }
  @Sse(':id/events') events(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Observable<MessageEvent> {
    const fingerprint = (task: Awaited<ReturnType<AgentTasksService['get']>>) => [
      task.status,
      task.updatedAt.getTime(),
      task.run?.updatedAt?.getTime() || 0,
      task.run?.stream?.content?.length || 0,
      task.agentRun?.updatedAt?.getTime() || 0,
      task.agentRun?.finalAnswer?.length || 0,
      ...(task.agentRun?.toolCalls || []).flatMap((call) => [call.status, call.approvalStatus, call.updatedAt.getTime()]),
      ...task.steps.flatMap((step) => [step.status, step.updatedAt.getTime(), step.detail]),
    ].join('|')
    return interval(300).pipe(startWith(0), switchMap(() => from(this.tasks.get(user.id, id))), distinctUntilChanged((a, b) => fingerprint(a) === fingerprint(b)), map((task) => ({ type: 'task', id: task.id, data: task })), takeWhile((event) => !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(event.data.status), true))
  }
}
