import { Module } from '@nestjs/common'
import { PricingResolverService } from './pricing-resolver.service'
import { TokenizerService } from './tokenizer.service'
import { TokenQuotaService } from './token-quota.service'
import { TokenUsageLedgerService } from './token-usage-ledger.service'
import { TokenQuotaController } from './token-quota.controller'

@Module({
  providers: [PricingResolverService, TokenizerService, TokenQuotaService, TokenUsageLedgerService],
  controllers: [TokenQuotaController],
  exports: [PricingResolverService, TokenizerService, TokenQuotaService, TokenUsageLedgerService],
})
export class BillingModule {}
