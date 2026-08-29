import { Injectable } from '@nestjs/common'

export type PricingSnapshot = {
  resolverVersion: string
  model: string
  provider?: string | null
  inputRate: number
  outputRate: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  baseInputRate?: number
  baseOutputRate?: number
  groupRatePercent?: number
  completionRatio?: number
  inputMarkupPercent?: number | null
  outputMarkupPercent?: number | null
  billingSource?: string
  overageRatePercent?: number
  creditValueMicros?: number
  pricingUsdExchangeRateMicros?: number
  source?: string
  presetKey?: string
  [key: string]: unknown
}

export type UsageForPricing = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  reasoningTokens?: number
}

@Injectable()
export class PricingResolverService {
  readonly resolverVersion = 'v2'

  snapshot(input: {
    model: string
    provider?: string | null
    inputRate?: number
    outputRate?: number
    inputCostMicrosPerMillion?: number
    outputCostMicrosPerMillion?: number
    [key: string]: unknown
  }): PricingSnapshot {
    const inputRate = this.integer(input.inputRate)
    const outputRate = this.integer(input.outputRate)
    const inputCost = this.integer(input.inputCostMicrosPerMillion)
    const outputCost = this.integer(input.outputCostMicrosPerMillion)
    const baseInputRate = this.integer(input.baseInputRate ?? inputRate)
    const baseOutputRate = this.integer(input.baseOutputRate ?? outputRate)
    const groupRatePercent = this.integer(input.groupRatePercent ?? 100)
    const creditValueMicros = Math.max(1, this.integer(input.creditValueMicros) || 1)
    const exchangeRateMicros = Math.max(1, this.integer(input.pricingUsdExchangeRateMicros) || 1_000_000)
    const markup = (rate: number, cost: number) => cost > 0
      ? Math.round(rate * creditValueMicros * 100_000_000 / (cost * exchangeRateMicros))
      : null
    return {
      ...input,
      resolverVersion: this.resolverVersion,
      model: input.model,
      provider: input.provider ?? null,
      inputRate,
      outputRate,
      inputCostMicrosPerMillion: inputCost,
      outputCostMicrosPerMillion: outputCost,
      baseInputRate,
      baseOutputRate,
      groupRatePercent,
      completionRatio: baseInputRate > 0 ? Number((baseOutputRate / baseInputRate).toFixed(6)) : 0,
      inputMarkupPercent: markup(inputRate, inputCost),
      outputMarkupPercent: markup(outputRate, outputCost),
    }
  }

  chargedUnits(snapshot: PricingSnapshot, usage: UsageForPricing): bigint {
    const input = BigInt(this.integer(usage.inputTokens)) * BigInt(this.integer(snapshot.inputRate))
    const output = BigInt(this.integer(usage.outputTokens)) * BigInt(this.integer(snapshot.outputRate))
    // cached/reasoning are recorded in V1 but are already included in the
    // provider's normalized input/output totals, so do not double charge.
    const total = input + output
    return (total + 999_999n) / 1_000_000n
  }

  settlement(snapshot: PricingSnapshot, usage: UsageForPricing, billingSource = snapshot.billingSource || 'SUBSCRIPTION_QUOTA') {
    const chargedUnits = this.chargedUnits(snapshot, usage)
    const overageRatePercent = BigInt(this.integer(snapshot.overageRatePercent))
    const chargedCredits = billingSource === 'OVERAGE_CREDITS'
      ? (chargedUnits * overageRatePercent + 99n) / 100n
      : billingSource === 'CREATION_CREDITS'
        ? chargedUnits
        : 0n
    return { chargedUnits, chargedCredits }
  }

  costMicros(snapshot: PricingSnapshot, usage: UsageForPricing): number {
    const total = BigInt(this.integer(usage.inputTokens)) * BigInt(this.integer(snapshot.inputCostMicrosPerMillion))
      + BigInt(this.integer(usage.outputTokens)) * BigInt(this.integer(snapshot.outputCostMicrosPerMillion))
    const exchangeRateMicros = BigInt(Math.max(1, this.integer(snapshot.pricingUsdExchangeRateMicros) || 1_000_000))
    const divisor = 1_000_000_000_000n
    const micros = (total * exchangeRateMicros + divisor - 1n) / divisor
    return Number(micros > 2_000_000_000n ? 2_000_000_000n : micros)
  }

  private integer(value: unknown) {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
  }
}
