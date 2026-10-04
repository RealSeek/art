export function supportsImageInput(options: unknown): boolean {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return false
  const value = options as { agentCapabilities?: { supportsVision?: boolean }; discovery?: { features?: string[] } }
  return value.agentCapabilities?.supportsVision === true || value.discovery?.features?.includes('vision') === true
}
