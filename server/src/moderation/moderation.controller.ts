import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ModerationAction, ModerationEventStatus, ModerationRuleType, ModerationSource } from '@prisma/client'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { ModerationService } from './moderation.service'

class UpdatePolicyDto {
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() scanChat?: boolean
  @IsOptional() @IsBoolean() scanImage?: boolean
  @IsOptional() @IsBoolean() scanCommerce?: boolean
  @IsOptional() @IsBoolean() failClosed?: boolean
  @IsOptional() @IsBoolean() retainContent?: boolean
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(300) blockMessage?: string
  @IsOptional() @IsInt() @Min(40) @Max(1000) excerptLength?: number
}

class CreateRuleDto {
  @IsString() @Matches(/\S/) @MaxLength(80) name!: string
  @IsOptional() @IsString() @MaxLength(80) category?: string
  @IsEnum(ModerationRuleType) type!: ModerationRuleType
  @IsString() @MinLength(1) @MaxLength(500) pattern!: string
  @IsEnum(ModerationAction) action!: ModerationAction
  @IsOptional() @IsBoolean() caseSensitive?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number
  @IsOptional() @IsString() @MaxLength(500) description?: string
}

class UpdateRuleDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(80) name?: string
  @IsOptional() @IsString() @MaxLength(80) category?: string
  @IsOptional() @IsEnum(ModerationRuleType) type?: ModerationRuleType
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) pattern?: string
  @IsOptional() @IsEnum(ModerationAction) action?: ModerationAction
  @IsOptional() @IsBoolean() caseSensitive?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number
  @IsOptional() @IsString() @MaxLength(500) description?: string
}

class ResolveEventDto {
  @IsEnum(ModerationEventStatus) status!: ModerationEventStatus
  @IsOptional() @IsString() @MaxLength(500) note?: string
}

@Controller('admin/moderation')
@UseGuards(AuthGuard, AdminGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('policy') policy() { return this.moderation.getPolicy() }
  @Patch('policy') updatePolicy(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdatePolicyDto) { return this.moderation.updatePolicy(user.id, body) }
  @Get('rules') rules() { return this.moderation.listRules() }
  @Post('rules') createRule(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateRuleDto) { return this.moderation.createRule(user.id, { ...body, category: body.category?.trim() || '自定义', caseSensitive: body.caseSensitive ?? false, enabled: body.enabled ?? true, sortOrder: body.sortOrder ?? 0, description: body.description?.trim() || '' }) }
  @Patch('rules/:id') updateRule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateRuleDto) { return this.moderation.updateRule(user.id, id, body) }
  @Delete('rules/:id') deleteRule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.moderation.deleteRule(user.id, id) }
  @Get('events') events(@Query('status') status?: ModerationEventStatus, @Query('source') source?: ModerationSource) { return this.moderation.listEvents(status, source) }
  @Patch('events/:id') resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ResolveEventDto) { return this.moderation.resolveEvent(user.id, id, body.status, body.note) }
}
