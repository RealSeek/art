const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
require('dotenv').config()

process.env.ADMIN_EMAIL ||= 'xinyue@xinyue.mom'
process.env.ADMIN_PASSWORD ||= 'xinyue.mom'

const required = ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'CREDENTIAL_ENCRYPTION_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}
if (process.env.SESSION_SECRET.length < 32 || process.env.CREDENTIAL_ENCRYPTION_KEY.length < 32 || process.env.ADMIN_PASSWORD.length < 8) {
  console.error('[startup] SESSION_SECRET and CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters; ADMIN_PASSWORD must contain at least 8 characters.')
  process.exit(1)
}
if ([process.env.SESSION_SECRET, process.env.CREDENTIAL_ENCRYPTION_KEY, process.env.ADMIN_PASSWORD].some((value) => value.includes('replace-with'))) {
  console.error('[startup] Replace all placeholder secrets before starting production.')
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: resolve(__dirname, '..'), env: process.env, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}

run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'])
run(process.execPath, [resolve(__dirname, 'seed-admin.cjs')])
require('../dist/main.js')
