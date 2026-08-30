import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

const script = resolve('server/scripts/start-production.cjs')
const require = createRequire(import.meta.url)
const { assertProductionSecrets, enforceSecureCookiesForHttpsOrigins } = require('../../server/scripts/start-production.cjs') as {
  enforceSecureCookiesForHttpsOrigins: (env: NodeJS.ProcessEnv) => boolean
  assertProductionSecrets: (env: NodeJS.ProcessEnv) => void
}
const baseEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  REDIS_URL: 'redis://127.0.0.1:1',
  SESSION_SECRET: 's'.repeat(64),
  CREDENTIAL_ENCRYPTION_KEY: 'c'.repeat(64),
  POSTGRES_PASSWORD: 'p'.repeat(64),
  LOCAL_WORKER_TOKEN: 'w'.repeat(64),
  INSTALL_TOKEN: 'i'.repeat(64),
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
}

function start(overrides: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    cwd: resolve('server'),
    env: { ...baseEnv, ...overrides },
    encoding: 'utf8',
  })
}

test('production startup rejects the published development install token', () => {
  const result = start({ INSTALL_TOKEN: 'development-install-token-change-me-123456' })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /development example and cannot be used in production/)
})

test('production startup requires a strong install token when no administrator is pre-seeded', () => {
  const result = start({ INSTALL_TOKEN: '' })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /INSTALL_TOKEN must contain at least 32 characters/)
})

test('production startup rejects an empty worker token', () => {
  const result = start({ LOCAL_WORKER_TOKEN: '' })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /LOCAL_WORKER_TOKEN/)
})

test('production startup rejects reused session and encryption secrets', () => {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    SESSION_SECRET: 'same'.repeat(16),
    CREDENTIAL_ENCRYPTION_KEY: 'same'.repeat(16),
  }
  assert.throws(() => assertProductionSecrets(env), /must be different/)
})

test('production startup rejects placeholder administrator credentials', () => {
  const result = start({
    INSTALL_TOKEN: 'i'.repeat(64),
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'replace-with-a-real-password',
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /Replace all placeholder secrets before starting production/)
})

test('production startup rejects known local or staging secret values', () => {
  assert.throws(() => assertProductionSecrets({
    ...baseEnv,
    POSTGRES_PASSWORD: 'xinyue-rc-postgres-2026-local-only',
  }), /empty, weak, or placeholders/)
})

test('production startup forces secure cookies when any web origin uses HTTPS', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    WEB_ORIGIN: 'http://localhost:8080, https://xinyue.example',
    COOKIE_SECURE: 'false',
  }

  assert.equal(enforceSecureCookiesForHttpsOrigins(env), true)
  assert.equal(env.COOKIE_SECURE, 'true')
})

test('production startup keeps secure cookies configurable for HTTP localhost deployments', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    WEB_ORIGIN: 'http://localhost:8080',
    COOKIE_SECURE: 'false',
  }

  assert.equal(enforceSecureCookiesForHttpsOrigins(env), false)
  assert.equal(env.COOKIE_SECURE, 'false')
})
