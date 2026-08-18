import { forwardRef, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ProvidersModule } from '../providers/providers.module'
import { NotificationsService } from './notifications.service'

@Module({ imports: [forwardRef(() => AuthModule), ProvidersModule], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
