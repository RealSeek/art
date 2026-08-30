const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

function enforceSecureCookiesForHttpsOrigins(env) {
  if (env.NODE_ENV !== 'production') return false
  const hasHttpsOrigin = String(env.WEB_ORIGIN || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      try {
        return new URL(entry).protocol === 'https:'
      } catch {
        return false
      }
    })
  if (hasHttpsOrigin) env.COOKIE_SECURE = 'true'
  return hasHttpsOrigin
}

const PRODUCTION_SECRET_KEYS = [
  'POSTGRES_PASSWORD',
  'SESSION_SECRET',
  'CREDENTIAL_ENCRYPTION_KEY',
  'INSTALL_TOKEN',
  'LOCAL_WORKER_TOKEN',
]
const PLACEHOLDER_SECRET = /(replace-with|change-me|changeme|example|dev_password|default-password|your[_-]|flux[_-]?dev|xinyue[_-]?(?:rc|dev|test)|local[_-]?only|staging|test[_-]?(?:secret|password))/i

function assertProductionSecrets(env) {
  if (env.NODE_ENV !== 'production') return
  const installToken = String(env.INSTALL_TOKEN || '').trim()
  if (!installToken) throw new Error('[startup] INSTALL_TOKEN must contain at least 32 characters in production.')
  if (installToken === 'development-install-token-change-me-123456') {
    throw new Error('[startup] INSTALL_TOKEN is a development example and cannot be used in production.')
  }
  const missing = PRODUCTION_SECRET_KEYS.filter((key) => !String(env[key] || '').trim())
  if (missing.length) throw new Error(`[startup] Missing required production secrets: ${missing.join(', ')}`)
  const weak = PRODUCTION_SECRET_KEYS.filter((key) => {
    const value = String(env[key] || '').trim()
    return value.length < 32 || PLACEHOLDER_SECRET.test(value)
  })
  if (weak.length) throw new Error(`[startup] Production secrets are empty, weak, or placeholders: ${weak.join(', ')}`)
  if (env.SESSION_SECRET === env.CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error('[startup] SESSION_SECRET and CREDENTIAL_ENCRYPTION_KEY must be different values.')
  }
  if (String(env.DATABASE_URL || '').includes('${')) {
    throw new Error('[startup] DATABASE_URL still contains unresolved environment interpolation.')
  }
}

function main() {
  require('dotenv').config()
  enforceSecureCookiesForHttpsOrigins(process.env)

  if (process.env.NODE_ENV !== 'production') {
    console.error('[startup] start-production.cjs requires NODE_ENV=production.')
    process.exit(1)
  }
  try {
    assertProductionSecrets(process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : '[startup] Invalid production environment.')
    process.exit(1)
  }

  const required = ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'CREDENTIAL_ENCRYPTION_KEY']
  const missing = required.filter((key) => !process.env[key]?.trim())
  if (missing.length) {
    console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim()
  const adminPassword = String(process.env.ADMIN_PASSWORD || '')
  const installToken = String(process.env.INSTALL_TOKEN || '').trim()
  const exampleAdminCredentialDigest = '6c91dc0644604e70233fb3bd549a2767518f495cfe32e1fb0ad07e4ec5029bb9'
  const adminCredentialDigest = createHash('sha256').update(`${adminEmail}\0${adminPassword}`).digest('hex')
  if (process.env.SESSION_SECRET.length < 32 || process.env.CREDENTIAL_ENCRYPTION_KEY.length < 32 || (adminEmail && adminPassword.length < 8)) {
    console.error('[startup] SESSION_SECRET and CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters; configured ADMIN_PASSWORD must contain at least 8 characters.')
    process.exit(1)
  }
  if ([process.env.SESSION_SECRET, process.env.CREDENTIAL_ENCRYPTION_KEY, process.env.ADMIN_PASSWORD, installToken].some((value) => String(value || '').includes('replace-with'))) {
    console.error('[startup] Replace all placeholder secrets before starting production.')
    process.exit(1)
  }
  if (process.env.NODE_ENV === 'production') {
    // The setup endpoint is protected by INSTALL_TOKEN. A public example token
    // would let anyone who sees the sample configuration claim the first admin.
    if (installToken === 'development-install-token-change-me-123456') {
      console.error('[startup] INSTALL_TOKEN is a development example and cannot be used in production.')
      process.exit(1)
    }
    if (adminCredentialDigest === exampleAdminCredentialDigest) {
      console.error('[startup] The example administrator credentials cannot be used in production.')
      process.exit(1)
    }
  }
  if (Boolean(adminEmail) !== Boolean(adminPassword.trim())) {
    console.error('[startup] Set both ADMIN_EMAIL and ADMIN_PASSWORD, or leave both empty to use the /install wizard.')
    process.exit(1)
  }
  if (!adminEmail && installToken.length < 32) {
    console.error('[startup] INSTALL_TOKEN must contain at least 32 characters when using the /install wizard.')
    process.exit(1)
  }

  function run(command, args) {
    const result = spawnSync(command, args, { cwd: resolve(__dirname, '..'), env: process.env, stdio: 'inherit' })
    if (result.status !== 0) process.exit(result.status || 1)
  }

  run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'])
  if (adminEmail && adminPassword.trim()) run(process.execPath, [resolve(__dirname, 'seed-admin.cjs')])
  else console.log('[startup] No administrator credentials supplied; complete initialization at /install.')
  require('../dist/main.js')
}

if (require.main === module) main()

module.exports = { assertProductionSecrets, enforceSecureCookiesForHttpsOrigins }
