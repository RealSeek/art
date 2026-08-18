import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AdminGuard } from '../admin/admin.guard'
import { AssetsModule } from '../assets/assets.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { CreditsModule } from '../credits/credits.module'
import { AccountLifecycleController, AdminAccountLifecycleController } from './account-lifecycle.controller'
import { AccountLifecycleProcessor } from './account-lifecycle.processor'
import { AccountLifecycleService } from './account-lifecycle.service'
import { AdminBillingController, BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { AdminReferralController, ReferralController } from './referral.controller'
import { ReferralService } from './referral.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'commercial-lifecycle' }), AssetsModule, CreditsModule, NotificationsModule],
  controllers: [AccountLifecycleController, AdminAccountLifecycleController, BillingController, AdminBillingController, ReferralController, AdminReferralController],
  providers: [AccountLifecycleService, AccountLifecycleProcessor, BillingService, ReferralService, AdminGuard],
  exports: [AccountLifecycleService, BillingService, ReferralService],
})
export class CommercialModule {}
