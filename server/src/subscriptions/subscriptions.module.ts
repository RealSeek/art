import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { CreditsModule } from '../credits/credits.module'
import { CommerceModule } from '../commerce/commerce.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AdminSubscriptionsController, SubscriptionsController } from './subscriptions.controller'
import { SubscriptionsProcessor } from './subscriptions.processor'
import { SubscriptionsService } from './subscriptions.service'

@Module({ imports: [BullModule.registerQueue({ name: 'subscription-lifecycle' }), CreditsModule, NotificationsModule, CommerceModule], controllers: [SubscriptionsController, AdminSubscriptionsController], providers: [SubscriptionsService, SubscriptionsProcessor], exports: [SubscriptionsService] })
export class SubscriptionsModule {}
