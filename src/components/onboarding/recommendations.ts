import type { CapabilityType, OnlyCodeGroupInfo } from '../shell/types'

export function recommendGroupNames(groups: OnlyCodeGroupInfo[], capabilities: CapabilityType[], connectedGroups = new Set<string>()) {
  const recommended = new Set<string>()
  for (const capability of capabilities) {
    const candidate = groups
      .filter((group) => !connectedGroups.has(group.name) && group.capabilities.includes(capability))
      .sort((left, right) => left.ratio - right.ratio || right.models.length - left.models.length || left.name.localeCompare(right.name))[0]
    if (candidate) recommended.add(candidate.name)
  }
  return recommended
}
