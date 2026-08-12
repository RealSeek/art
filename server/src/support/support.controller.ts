import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { SupportTicketPriority, SupportTicketStatus } from '@prisma/client'
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { SupportService } from './support.service'

class CreateTicketDto {
  @IsString() @Matches(/\S/) @MinLength(3) @MaxLength(120) subject!: string
  @IsOptional() @IsString() @MaxLength(50) category?: string
  @IsString() @Matches(/\S/) @MinLength(3) @MaxLength(10000) body!: string
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) assetIds?: string[]
}
class ReplyTicketDto { @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(10000) body!: string; @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) assetIds?: string[] }
class UpdateTicketDto { @IsOptional() @IsEnum(SupportTicketStatus) status?: SupportTicketStatus; @IsOptional() @IsEnum(SupportTicketPriority) priority?: SupportTicketPriority; @IsOptional() @IsString() @MaxLength(100) assignedToId?: string | null }
class ListTicketsDto {
  @IsOptional() @IsEnum(SupportTicketStatus) status?: SupportTicketStatus
  @IsOptional() @IsEnum(SupportTicketPriority) priority?: SupportTicketPriority
  @IsOptional() @IsString() @MaxLength(100) q?: string
  @IsOptional() @IsString() @MaxLength(100) assigned?: string
}

@Controller('support/tickets')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.support.listForUser(user.id) }
  @Get('unread') unread(@CurrentUser() user: AuthenticatedUser) { return this.support.unreadForUser(user.id) }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateTicketDto) { return this.support.create(user.id, body) }
  @Get(':id') detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.support.detailForUser(user.id, id) }
  @Post(':id/messages') reply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ReplyTicketDto) { return this.support.replyForUser(user.id, id, body) }
  @Post(':id/close') close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.support.closeForUser(user.id, id) }
}

@Controller('admin/support/tickets')
@UseGuards(AuthGuard, AdminGuard)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}
  @Get('summary') summary() { return this.support.adminSummary() }
  @Get('agents') agents() { return this.support.listAgents() }
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTicketsDto) { return this.support.listForAdmin(user.id, { status: query.status, priority: query.priority, query: query.q, assigned: query.assigned }) }
  @Get(':id') detail(@Param('id') id: string) { return this.support.detailForAdmin(id) }
  @Post(':id/messages') reply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ReplyTicketDto) { return this.support.replyForAdmin(user.id, id, body) }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateTicketDto) { return this.support.updateForAdmin(user.id, id, body) }
}
