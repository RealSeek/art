import assert from 'node:assert/strict'
import test from 'node:test'
import { UsersController } from '../../server/src/users/users.controller'

test('OnlyArt 使用绑定的 New API subject 查询实时余额', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  let requestBody: Record<string, unknown> | undefined
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ success: true, data: { balance: 12.5, symbol: '$', display_type: 'USD' } }), { status: 200 })
  }
  const prisma = { externalIdentity: { findFirst: async () => ({ subject: '42' }) } }
  const config = { get: (key: string) => ({ NEW_API_BASE_URL: 'https://onlycode.example', NEW_API_SSO_CLIENT_ID: 'onlyart', NEW_API_SSO_CLIENT_SECRET: 'secret' })[key] }
  const controller = new UsersController(prisma as never, config as never)

  const result = await controller.onlyCodeBalance({ id: 'art-user' } as never)

  assert.deepEqual(requestBody, { client_id: 'onlyart', client_secret: 'secret', subject: '42' })
  assert.deepEqual(result, { balance: 12.5, symbol: '$', displayType: 'USD' })
})

test('OnlyCode 余额查询失败时不会回退到 OnlyArt 本地余额', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => new Response('{}', { status: 503 })
  const prisma = { externalIdentity: { findFirst: async () => ({ subject: '42' }) } }
  const config = { get: (key: string) => ({ NEW_API_BASE_URL: 'https://onlycode.example', NEW_API_SSO_CLIENT_ID: 'onlyart', NEW_API_SSO_CLIENT_SECRET: 'secret' })[key] }
  const controller = new UsersController(prisma as never, config as never)

  await assert.rejects(() => controller.onlyCodeBalance({ id: 'art-user' } as never), /OnlyCode 余额暂时不可用/)
})
