import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client'
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { NotificationsService } from '../notifications/notifications.service'
import { AdminGuard } from './admin.guard'

class NotificationTemplateDto {
  @IsString() @MinLength(2) @MaxLength(64) key!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(500) description?: string
  @IsString() @MinLength(1) @MaxLength(300) titleTemplate!: string
  @IsString() @MinLength(1) @MaxLength(20_000) bodyTemplate!: string
  @IsArray() @ArrayMaxSize(3) @IsEnum(NotificationChannel, { each: true }) channels!: NotificationChannel[]
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsString() @MaxLength(1000) webhookUrl?: string
  @IsOptional() @IsString() @MaxLength(1000) webhookSecret?: string
}

class NotificationTestDto {
  @IsObject() variables!: Record<string, string | number | boolean | null>
}

@Controller('admin/notifications')
@UseGuards(AuthGuard, AdminGuard)
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('templates') templates() { return this.notifications.listTemplates() }
  @Post('templates') create(@Body() body: NotificationTemplateDto) { return this.notifications.saveTemplate(undefined, body) }
  @Patch('templates/:id') update(@Param('id') id: string, @Body() body: NotificationTemplateDto) { return this.notifications.saveTemplate(id, body) }
  @Delete('templates/:id') remove(@Param('id') id: string) { return this.notifications.removeTemplate(id) }
  @Post('templates/:key/test') test(@CurrentUser() admin: AuthenticatedUser, @Param('key') key: string, @Body() body: NotificationTestDto) { return this.notifications.send({ templateKey: key, userIds: [admin.id], variables: body.variables, metadata: { test: true } }) }
  @Get('deliveries') deliveries(@Query('status') status?: NotificationDeliveryStatus) { return this.notifications.listDeliveries(status && Object.values(NotificationDeliveryStatus).includes(status) ? status : undefined) }
  @Post('deliveries/:id/retry') retry(@Param('id') id: string) { return this.notifications.retry(id) }
}
