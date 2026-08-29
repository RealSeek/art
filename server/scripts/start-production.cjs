const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
require('dotenv').config()

const required = ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'CREDENTIAL_ENCRYPTION_KEY']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim()
const adminPassword = String(process.env.ADMIN_PASSWORD || '')
if (process.env.SESSION_SECRET.length < 32 || process.env.CREDENTIAL_ENCRYPTION_KEY.length < 32 || (adminEmail && adminPassword.length < 8)) {
  console.error('[startup] SESSION_SECRET and CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters; configured ADMIN_PASSWORD must contain at least 8 characters.')
  process.exit(1)
}
if ([process.env.SESSION_SECRET, process.env.CREDENTIAL_ENCRYPTION_KEY, process.env.ADMIN_PASSWORD].some((value) => String(value || '').includes('replace-with'))) {
  console.error('[startup] Replace all placeholder secrets before starting production.')
  process.exit(1)
}
if (Boolean(adminEmail) !== Boolean(adminPassword.trim())) {
  console.error('[startup] Set both ADMIN_EMAIL and ADMIN_PASSWORD, or leave both empty to use the /install wizard.')
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
