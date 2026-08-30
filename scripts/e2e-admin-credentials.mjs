/**
 * Read credentials explicitly supplied for local E2E/UI checks.
 * Production and freshly installed environments must use the install wizard;
 * these scripts must never ship with a reusable administrator password.
 */
export function getE2EAdminCredentials() {
  const email = String(process.env.E2E_ADMIN_EMAIL || '').trim()
  const password = String(process.env.E2E_ADMIN_PASSWORD || '')
  if (!email || !password) {
    throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD before running this audit script.')
  }
  return { email, password }
}
