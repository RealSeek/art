import { Injectable } from '@nestjs/common'

export type PricingSnapshot = {
  resolverVersion: string
  model: string
  provider?: string | null
  inputRate: number
  outputRate: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  creditValueMicros?: number
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
  readonly resolverVersion = 'v1'

  snapshot(input: {
    model: string
    provider?: string | null
    inputRate?: number
    outputRate?: number
    inputCostMicrosPerMillion?: number
    outputCostMicrosPerMillion?: number
    [key: string]: unknown
  }): PricingSnapshot {
    return {
      ...input,
      resolverVersion: this.resolverVersion,
      model: input.model,
      provider: input.provider ?? null,
      inputRate: this.integer(input.inputRate),
      outputRate: this.integer(input.outputRate),
      inputCostMicrosPerMillion: this.integer(input.inputCostMicrosPerMillion),
      outputCostMicrosPerMillion: this.integer(input.outputCostMicrosPerMillion),
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

  costMicros(snapshot: PricingSnapshot, usage: UsageForPricing): number {
    const total = BigInt(this.integer(usage.inputTokens)) * BigInt(this.integer(snapshot.inputCostMicrosPerMillion))
      + BigInt(this.integer(usage.outputTokens)) * BigInt(this.integer(snapshot.outputCostMicrosPerMillion))
    const micros = (total + 999_999n) / 1_000_000n
    return Number(micros > 2_000_000_000n ? 2_000_000_000n : micros)
  }

  private integer(value: unknown) {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
  }
}
