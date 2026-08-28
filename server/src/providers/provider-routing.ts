export type ProviderSourceRequirement = 'platform' | 'user' | undefined

export function providerSourceRequirement(value: unknown): ProviderSourceRequirement {
  if (value === 'platform' || value === 'user') return value
  return undefined
}

export function userCredentialCreditCost(
  requiredSource: ProviderSourceRequirement,
  platformCreditCost: number
) {
  return requiredSource === 'user' ? 0 : platformCreditCost
}

type RoutingCandidate<T> = {
  value: T
  priority: number
  weight: number
  createdAt?: Date
}

export function orderPrivateRoutes<T>(
  candidates: RoutingCandidate<T>[],
  strategy: string,
  epochSeconds = Math.floor(Date.now() / 1000),
  random: () => number = Math.random
) {
  const ranked = candidates.map((candidate) => ({
    ...candidate,
    score: random() ** (1 / Math.max(1, candidate.weight))
  }))
  if (strategy === 'WEIGHTED') ranked.sort((a, b) => b.score - a.score)
  else {
    ranked.sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0)
    )
  }
  if (strategy === 'ROUND_ROBIN' && ranked.length > 1) {
    const offset = epochSeconds % ranked.length
    ranked.push(...ranked.splice(0, offset))
  }
  return ranked.map(({ value }) => value)
}

export function orderPlatformRoutes<T>(
  candidates: RoutingCandidate<T>[],
  random: () => number = Math.random
) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: random() ** (1 / Math.max(1, candidate.weight))
    }))
    .sort((a, b) => b.priority - a.priority || b.score - a.score)
    .map(({ value }) => value)
}
