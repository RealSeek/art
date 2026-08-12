import { Module } from '@nestjs/common'
import { AdminGuard } from '../admin/admin.guard'
import { ModerationController } from './moderation.controller'
import { ModerationService } from './moderation.service'

@Module({ controllers: [ModerationController], providers: [ModerationService, AdminGuard], exports: [ModerationService] })
export class ModerationModule {}
