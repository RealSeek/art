import { Body, Controller, Delete, Get, MessageEvent, Param, Patch, Post, Query, Sse, UseGuards } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { Observable, distinctUntilChanged, from, interval, map, startWith, switchMap, takeWhile } from 'rxjs'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { AgentTasksService } from './agent-tasks.service'
import { AgentSchedulesService } from './agent-schedules.service'

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
  @IsOptional() @IsBoolean() webSearchEnabled?: boolean
}

class ReviewAgentToolCallDto { @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED' }
class UpdateAgentTaskDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) title?: string
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(20_000) goal?: string
  @IsOptional() @IsString() @MaxLength(20_000) instructions?: string
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(160) model?: string
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9:_-]+$/) @MaxLength(100) skillId?: string
  @IsOptional() @IsString() @MaxLength(100) assistantId?: string
  @IsOptional() @IsString() @MaxLength(100) projectId?: string
  @IsOptional() @IsString() @MaxLength(100) pluginId?: string
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) attachmentIds?: string[]
  @IsOptional() @IsBoolean() webSearchEnabled?: boolean
}
class AgentScheduleDto extends CreateAgentTaskDto {
  @IsString() @Matches(/^\s*\S+(\s+\S+){4,6}\s*$/) @MaxLength(100) cronExpression!: string
  @IsOptional() @IsString() @MaxLength(100) timezone?: string
  @IsOptional() @IsBoolean() enabled?: boolean
}
class UpdateAgentScheduleDto extends UpdateAgentTaskDto {
  @IsOptional() @IsString() @Matches(/^\s*\S+(\s+\S+){4,6}\s*$/) @MaxLength(100) cronExpression?: string
  @IsOptional() @IsString() @MaxLength(100) timezone?: string
  @IsOptional() @IsBoolean() enabled?: boolean
}

@Controller('agent-tasks')
@UseGuards(AuthGuard)
export class AgentTasksController {
  constructor(private readonly tasks: AgentTasksService, private readonly schedules: AgentSchedulesService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query('archived') archived?: string) { return this.tasks.list(user.id, archived === 'true') }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateAgentTaskDto) { return this.tasks.create(user.id, body) }
  @Get('schedules/list/all') listSchedules(@CurrentUser() user: AuthenticatedUser) { return this.schedules.list(user.id) }
  @Post('schedules/create') createSchedule(@CurrentUser() user: AuthenticatedUser, @Body() body: AgentScheduleDto) { return this.schedules.create(user.id, body) }
  @Get('schedules/:scheduleId') getSchedule(@CurrentUser() user: AuthenticatedUser, @Param('scheduleId') id: string) { return this.schedules.get(user.id, id) }
  @Patch('schedules/:scheduleId') updateSchedule(@CurrentUser() user: AuthenticatedUser, @Param('scheduleId') id: string, @Body() body: UpdateAgentScheduleDto) { return this.schedules.update(user.id, id, body) }
  @Post('schedules/:scheduleId/run') runSchedule(@CurrentUser() user: AuthenticatedUser, @Param('scheduleId') id: string) { return this.schedules.runNow(user.id, id) }
  @Delete('schedules/:scheduleId') removeSchedule(@CurrentUser() user: AuthenticatedUser, @Param('scheduleId') id: string) { return this.schedules.remove(user.id, id) }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateAgentTaskDto) { return this.tasks.update(user.id, id, body) }
  @Get(':id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.get(user.id, id) }
  @Post(':id/run') run(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.run(user.id, id) }
  @Post(':id/cancel') cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.cancel(user.id, id) }
  @Post(':id/retry') retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.retry(user.id, id) }
  @Post(':id/duplicate') duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.duplicate(user.id, id) }
  @Post(':id/archive') archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.setArchived(user.id, id, true) }
  @Post(':id/unarchive') unarchive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.tasks.setArchived(user.id, id, false) }
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
