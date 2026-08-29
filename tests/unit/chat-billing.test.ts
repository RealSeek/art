import assert from 'node:assert/strict'
import test from 'node:test'
import { PricingResolverService } from '../../server/src/billing/pricing-resolver.service'
import { calculateChatTokenSettlement, parseChatBillingOptions } from '../../server/src/generations/chat-billing'

test('chat billing parser ignores malformed options', () => {
  assert.deepEqual(parseChatBillingOptions(null), {})
  assert.deepEqual(parseChatBillingOptions([]), {})
  assert.deepEqual(parseChatBillingOptions({ billing: [] }), {})
  assert.deepEqual(parseChatBillingOptions({ billing: { inputCreditsPerMillion: 120, outputCreditsPerMillion: 480 } }), {
    inputCreditsPerMillion: 120,
    outputCreditsPerMillion: 480,
  })
})

test('chat token settlement delegates to the shared pricing resolver', () => {
  const pricing = new PricingResolverService()
  const result = calculateChatTokenSettlement(pricing, {
    inputCreditsPerMillion: 100,
    outputCreditsPerMillion: 400,
    overageRatePercent: 50,
    billingSource: 'OVERAGE_CREDITS',
  }, 1_000_000, 500_000)

  assert.deepEqual(result, { chargedUnits: 300, chargedCredits: 150 })
})
