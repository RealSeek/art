export function safeHttpNavigationUrl(value: string | null | undefined, base = 'http://localhost') {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  try {
    const url = new URL(candidate, base)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    return url.toString()
  } catch {
    return ''
  }
}
