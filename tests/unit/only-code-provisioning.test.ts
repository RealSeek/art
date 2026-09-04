import assert from 'node:assert/strict'
import test from 'node:test'
import { ProvidersService } from '../../server/src/providers/providers.service'

const values: Record<string, string> = {
  NEW_API_BASE_URL: 'https://onlycode.example',
  NEW_API_PUBLIC_URL: 'https://api.onlycode.example',
  NEW_API_SSO_CLIENT_ID: 'onlyart',
  NEW_API_SSO_CLIENT_SECRET: '12345678901234567890123456789012',
}

test('OnlyArt 只按后台开放分组签发并加密保存 OnlyCode Key', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  let requestBody: Record<string, unknown> = {}
  let saved: Record<string, unknown> = {}
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ success: true, data: { token_id: 9, key: 'raw-key', group: 'gemini' } }), { status: 200 })
  }) as typeof fetch
  const prisma = {
    systemSetting: { upsert: async () => ({ newApiProvisioningGroups: ['gemini'] }) },
    userApiCredential: {
      findUnique: async () => null,
      count: async () => 0,
      upsert: async ({ create }: { create: Record<string, unknown> }) => { saved = create; return { id: 'credential-1', ...create } },
    },
    externalIdentity: { findFirst: async () => ({ subject: '42' }) },
    user: { findUnique: async () => ({ displayName: '测试用户', email: 'user@example.com' }) },
  }
  const crypto = { encrypt: (value: string) => `encrypted:${value}`, hint: (value: string) => value.slice(-4), decrypt: () => '' }
  const config = { get: (key: string) => values[key] }
  const service = new ProvidersService(prisma as never, crypto as never, config as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  service.userPolicy = (async () => ({ allowUserByok: true })) as typeof service.userPolicy
  service.importCredentialModels = (async () => ({ imported: 2, availableModels: ['gemini-2.5-pro'] })) as typeof service.importCredentialModels

  const result = await service.provisionOnlyCodeCredential('art-user', 'gemini')

  assert.equal(requestBody.subject, '42')
  assert.equal(requestBody.group, 'gemini')
  assert.match(String(requestBody.name), /^onlyart-/)
  assert.equal(saved.encryptedApiKey, 'encrypted:sk-raw-key')
  assert.equal(saved.baseUrl, 'https://api.onlycode.example/v1')
  assert.equal(saved.provisionKey, 'gemini')
  assert.equal(saved.externalTokenId, '9')
  assert.equal(result.imported, 2)
})

test('OnlyArt 拒绝用户请求后台未开放的 New API 分组', async () => {
  const prisma = { systemSetting: { upsert: async () => ({ newApiProvisioningGroups: ['gemini'] }) } }
  const config = { get: (key: string) => values[key] }
  const service = new ProvidersService(prisma as never, {} as never, config as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  service.userPolicy = (async () => ({ allowUserByok: true })) as typeof service.userPolicy

  await assert.rejects(() => service.provisionOnlyCodeCredential('art-user', 'codex-pro'), /暂未开放/)
})
