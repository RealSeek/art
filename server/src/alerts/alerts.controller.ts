import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { AlertsService } from './alerts.service'

class UpdateAlertRuleDto {
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) severity?: string
  @IsOptional() @IsInt() @Min(1) @Max(10080) cooldownMinutes?: number
  @IsOptional() @IsBoolean() notifyInApp?: boolean
  @IsOptional() @IsBoolean() notifyWebhook?: boolean
  @IsOptional() @IsString() @MaxLength(500) webhookUrl?: string
  @IsOptional() @IsString() @MaxLength(500) webhookSecret?: string
}
class MuteAlertRuleDto { @IsInt() @Min(1) @Max(43200) minutes!: number }

@Controller('admin/alerts')
@UseGuards(AuthGuard, AdminGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService, private readonly prisma: PrismaService) {}
  @Get('rules') rules() { return this.alerts.listRules() }
  @Patch('rules/:id') async update(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: UpdateAlertRuleDto) { const result = await this.alerts.updateRule(id, body); await this.audit(admin.id, request, 'alert.rule.update', 'alert_rule', id, result); return result }
  @Post('rules/:id/mute') async mute(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: MuteAlertRuleDto) { const result = await this.alerts.muteRule(id, body.minutes); await this.audit(admin.id, request, 'alert.rule.mute', 'alert_rule', id, result); return result }
  @Get('events') events(@Query('status') status?: string) { return this.alerts.listEvents(status) }
  @Post('events/:id/acknowledge') async acknowledge(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.alerts.acknowledge(id, admin.id); await this.audit(admin.id, request, 'alert.event.acknowledge', 'alert_event', id, result); return result }
  @Post('events/:id/resolve') async resolve(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.alerts.resolve(id); await this.audit(admin.id, request, 'alert.event.resolve', 'alert_event', id, result); return result }
  @Post('evaluate') async evaluate(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest) { const result = await this.alerts.evaluate(); await this.audit(admin.id, request, 'alert.evaluate', 'alert_system', 'global', result); return result }
  private audit(actorId: string, request: FastifyRequest, action: string, targetType: string, targetId: string, after: unknown) { return this.prisma.auditLog.create({ data: { actorId, action, targetType, targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } }) }
}
