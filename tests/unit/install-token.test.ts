import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthService } from '../../server/src/auth/auth.service'
import { isInstallTokenValid } from '../../server/src/auth/install-token'

const configured = 'd5f33f11ec6a419b8493075d91712bb56b4d80f8a11b9f6f'

test('install token accepts only an exact configured secret', () => {
  assert.equal(isInstallTokenValid(configured, configured), true)
  assert.equal(isInstallTokenValid(`${configured}x`, configured), false)
  assert.equal(isInstallTokenValid('', configured), false)
})

test('install token fails closed for missing, short, or placeholder configuration', () => {
  assert.equal(isInstallTokenValid(configured, undefined), false)
  assert.equal(isInstallTokenValid(configured, 'too-short'), false)
  assert.equal(isInstallTokenValid('replace-with-a-random-install-token', 'replace-with-a-random-install-token'), false)
})

test('administrator setup rejects an invalid token before accessing the database', async () => {
  let transactionCalled = false
  const prisma = { $transaction: async () => { transactionCalled = true } }
  const config = { get: (key: string) => key === 'INSTALL_TOKEN' ? configured : undefined }
  const service = new AuthService(prisma as never, config as never, {} as never, {} as never, {} as never, {} as never)

  await assert.rejects(
    () => service.setupAdmin({ email: 'admin@example.com', password: 'strong-password' }, {}, 'invalid-invalid-invalid-invalid-token'),
    (error: unknown) => error instanceof Error && error.constructor.name === 'ForbiddenException',
  )
  assert.equal(transactionCalled, false)
})
