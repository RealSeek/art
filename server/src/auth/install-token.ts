import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

export function isInstallTokenValid(providedToken?: string, configuredToken?: string) {
  const provided = providedToken?.trim() || ''
  const configured = configuredToken?.trim() || ''
  if (provided.length < 32 || configured.length < 32 || configured.startsWith('replace-with')) return false
  return timingSafeEqual(digest(provided), digest(configured))
}
