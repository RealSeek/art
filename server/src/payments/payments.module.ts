import { Module } from '@nestjs/common'
import { CreditsModule } from '../credits/credits.module'
import { ProvidersModule } from '../providers/providers.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { AdminPaymentsController, PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'

@Module({ imports: [CreditsModule, ProvidersModule, SubscriptionsModule], controllers: [PaymentsController, AdminPaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
