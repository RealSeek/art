import { Module } from '@nestjs/common'
import { CreditsController } from './credits.controller'
import { CreditsService } from './credits.service'
import { BillingTransactionsService } from './billing-transactions.service'

@Module({ controllers: [CreditsController], providers: [CreditsService, BillingTransactionsService], exports: [CreditsService, BillingTransactionsService] })
export class CreditsModule {}
