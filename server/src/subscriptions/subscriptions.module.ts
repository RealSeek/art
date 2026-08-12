import { Module } from '@nestjs/common'
import { CreditsModule } from '../credits/credits.module'
import { AdminSubscriptionsController, SubscriptionsController } from './subscriptions.controller'
import { SubscriptionsService } from './subscriptions.service'

@Module({ imports: [CreditsModule], controllers: [SubscriptionsController, AdminSubscriptionsController], providers: [SubscriptionsService], exports: [SubscriptionsService] })
export class SubscriptionsModule {}
