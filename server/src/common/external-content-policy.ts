/**
 * External content is opt-in.  Keep parsing deliberately strict so a typo in
 * an environment variable cannot unexpectedly enable a remote source.
 */
const OPT_IN_VALUES = new Set(['true', '1', 'yes', 'on'])

export function isOptInEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value !== 'string') return false
  return OPT_IN_VALUES.has(value.trim().toLowerCase())
}

export function isEnvironmentOptInEnabled(name: string): boolean {
  return isOptInEnabled(process.env[name])
}

export type ExternalSourcePolicyInput = {
  external: boolean
  configuredEnabled?: boolean
  reviewAcceptedAt?: Date | string | null
  environmentOptIn?: unknown
}

/**
 * Internal sources may be enabled by their normal default. External sources
 * require an administrator review timestamp or a deployment-level opt-in;
 * an explicit configured disable always wins.
 */
export function isSourceEffectivelyEnabled(input: ExternalSourcePolicyInput): boolean {
  if (input.configuredEnabled === false) return false
  if (!input.external) return input.configuredEnabled ?? true
  return Boolean(input.reviewAcceptedAt) || isOptInEnabled(input.environmentOptIn)
}
