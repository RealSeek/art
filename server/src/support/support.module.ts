import { Module } from '@nestjs/common'
import { AdminGuard } from '../admin/admin.guard'
import { ModerationModule } from '../moderation/moderation.module'
import { AdminSupportController, SupportController } from './support.controller'
import { SupportService } from './support.service'

@Module({ imports: [ModerationModule], controllers: [SupportController, AdminSupportController], providers: [SupportService, AdminGuard], exports: [SupportService] })
export class SupportModule {}
