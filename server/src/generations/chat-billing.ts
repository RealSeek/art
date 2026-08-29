import { Prisma } from '@prisma/client'
import { PricingResolverService } from '../billing/pricing-resolver.service'

export type ChatBillingOptions = {
  maxOutputTokens?: number
  reservedTokenUnits?: number
  reservedTokenCredits?: number
  baseInputCreditsPerMillion?: number
  baseOutputCreditsPerMillion?: number
  inputCreditsPerMillion?: number
  outputCreditsPerMillion?: number
  groupRatePercent?: number
  overageRatePercent?: number
  billingSource?: string
  subscriptionId?: string
  baseCreditCost?: number
  creditValueMicros?: number
  quotaEnabled?: boolean
  quotaId?: string
  quotaReservations?: Array<{ quotaId: string; reservedUnits: string | number }>
}

export function parseChatBillingOptions(options: Prisma.JsonValue): ChatBillingOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return {}
  const billing = options.billing
  return billing && typeof billing === 'object' && !Array.isArray(billing)
    ? billing as ChatBillingOptions
    : {}
}

export function calculateChatTokenSettlement(
  pricing: PricingResolverService,
  billing: ChatBillingOptions,
  inputTokens: number,
  outputTokens: number,
) {
  const snapshot = pricing.snapshot({
    model: 'settlement',
    inputRate: billing.inputCreditsPerMillion,
    outputRate: billing.outputCreditsPerMillion,
    billingSource: billing.billingSource,
    overageRatePercent: billing.overageRatePercent,
  })
  const settled = pricing.settlement(snapshot, { inputTokens, outputTokens })
  return {
    chargedUnits: Number(settled.chargedUnits),
    chargedCredits: Number(settled.chargedCredits),
  }
}
