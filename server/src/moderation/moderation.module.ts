import { Module } from '@nestjs/common'
import { AdminGuard } from '../admin/admin.guard'
import { ModerationController, UserModerationController } from './moderation.controller'
import { ModerationService } from './moderation.service'

@Module({ controllers: [ModerationController, UserModerationController], providers: [ModerationService, AdminGuard], exports: [ModerationService] })
export class ModerationModule {}
