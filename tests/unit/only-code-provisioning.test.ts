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
      findFirst: async () => null,
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { id: 'credential-1', ...data } },
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

test('手动添加密钥固定使用 OnlyCode 配置，并自动生成不重复名称', async () => {
  const saved: Array<Record<string, unknown>> = []
  const prisma = { userApiCredential: { create: async ({ data }: { data: Record<string, unknown> }) => { saved.push(data); return { id: `key-${saved.length}`, ...data } } } }
  const crypto = { encrypt: (value: string) => `encrypted:${value}`, hint: (value: string) => value.slice(-4) }
  const config = { get: (key: string) => values[key] }
  const service = new ProvidersService(prisma as never, crypto as never, config as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  service.assertUserProviderUrl = async (url) => url
  const input = { apiKey: 'sk-onlycode', name: '其他渠道', templateId: 'other', providerType: 'OPENAI', baseUrl: 'https://other.example/v1', authType: 'X_API_KEY', customHeaders: { Authorization: 'other' }, priority: 7, weight: 25 }

  await service.createCredential('art-user', input)
  await service.createCredential('art-user', input)

  for (const row of saved) {
    assert.match(String(row.name), /^OnlyCode-/)
    assert.equal(row.baseUrl, 'https://api.onlycode.example/v1')
    assert.equal(row.providerType, 'NEW_API')
    assert.equal(row.authType, 'BEARER')
    assert.equal(row.templateId, undefined)
    assert.equal(row.customHeaders, undefined)
    assert.equal(row.encryptedApiKey, 'encrypted:sk-onlycode')
    assert.equal(row.priority, 7)
    assert.equal(row.weight, 25)
  }
  assert.notEqual(saved[0].name, saved[1].name)
})

test('编辑 OnlyCode 密钥保留原名称和密钥，不能修改上游配置', async () => {
  let saved: Record<string, unknown> = {}
  const existing = { id: 'key-1', name: '聊天主密钥', baseUrl: 'https://api.onlycode.example/v1', encryptedApiKey: 'encrypted:original' }
  const prisma = { userApiCredential: {
    findFirst: async () => existing,
    update: async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { ...existing, ...data } },
  } }
  const service = new ProvidersService(prisma as never, {} as never, { get: (key: string) => values[key] } as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  service.userPolicy = (async () => ({ allowUserByok: true })) as typeof service.userPolicy
  service.assertUserProviderUrl = async (url) => url
  const input = { apiKey: '', enabled: false, baseUrl: 'https://other.example/v1', providerType: 'OPENAI', authType: 'X_API_KEY', templateId: 'other' }

  await service.updateCredential('art-user', 'key-1', input)

  assert.equal(saved.baseUrl, existing.baseUrl)
  assert.equal(saved.providerType, 'NEW_API')
  assert.equal(saved.authType, 'BEARER')
  assert.equal(saved.templateId, null)
  assert.equal(saved.name, undefined)
  assert.equal(saved.encryptedApiKey, undefined)
  assert.equal(saved.enabled, false)
  existing.baseUrl = 'https://legacy.example/v1'
  await assert.rejects(() => service.updateCredential('art-user', 'key-1', { priority: 1 }), /重新输入 OnlyCode/)
})

test('未配置 OnlyCode 时不能手动添加密钥', async () => {
  const service = new ProvidersService({} as never, {} as never, { get: () => undefined } as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  await assert.rejects(() => service.createCredential('art-user', { apiKey: 'sk-onlycode' }), /OnlyCode 接入尚未配置/)
})

test('OnlyArt 只向用户返回后台开放分组，并复用完整模型能力判断', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  let requestBody: Record<string, unknown> = {}
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ success: true, data: [
      { name: 'gemini', ratio: 0.2, models: ['gemini-2.5-pro', 'imagen-4', 'veo-3', 'text-embedding-004'] },
      { name: 'codex-pro', ratio: 0.3, models: ['gpt-5-codex'] },
    ] }), { status: 200 })
  }) as typeof fetch
  const prisma = { systemSetting: { upsert: async () => ({ newApiProvisioningGroups: ['gemini'] }) } }
  const config = { get: (key: string) => values[key] }
  const service = new ProvidersService(prisma as never, {} as never, config as never, {} as never, {} as never, {} as never, {} as never, {} as never)

  const groups = await service.onlyCodeProvisioningGroupDetails()
  const adminGroups = await service.onlyCodeProvisioningGroups()

  assert.equal(requestBody.details, true)
  assert.deepEqual(groups, [{ name: 'gemini', ratio: 0.2, models: ['gemini-2.5-pro', 'imagen-4', 'text-embedding-004', 'veo-3'], capabilities: ['CHAT', 'IMAGE', 'VIDEO'] }])
  assert.deepEqual(adminGroups, ['codex-pro', 'gemini'])
})

test('OnlyArt 同组不同名称可创建多个密钥，同名重试复用本地记录', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  const saved: Array<Record<string, unknown>> = []
  let remoteCalls = 0
  globalThis.fetch = (async (_input, init) => {
    remoteCalls += 1
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ success: true, data: { token_id: remoteCalls, key: `key-${remoteCalls}`, group: 'gemini', name: body.name } }), { status: 200 })
  }) as typeof fetch
  const prisma = {
    systemSetting: { upsert: async () => ({ newApiProvisioningGroups: ['gemini'] }) },
    userApiCredential: {
      findFirst: async ({ where }: { where: { name: string } }) => saved.find((item) => item.name === where.name) ? { id: `credential-${where.name}`, ...saved.find((item) => item.name === where.name) } : null,
      count: async ({ where }: { where: { name: string } }) => saved.some((item) => item.name === where.name) ? 1 : 0,
      create: async ({ data }: { data: Record<string, unknown> }) => { saved.push(data); return { id: `credential-${saved.length}`, ...data } },
    },
    externalIdentity: { findFirst: async () => ({ subject: '42' }) },
    user: { findUnique: async () => ({ displayName: '测试用户', email: 'user@example.com' }) },
  }
  const crypto = { encrypt: (value: string) => `encrypted:${value}`, hint: (value: string) => value.slice(-4), decrypt: () => '' }
  const config = { get: (key: string) => values[key] }
  const service = new ProvidersService(prisma as never, crypto as never, config as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  service.userPolicy = (async () => ({ allowUserByok: true })) as typeof service.userPolicy
  service.importCredentialModels = (async () => ({ imported: 1, availableModels: ['gemini-2.5-pro'] })) as typeof service.importCredentialModels

  await service.provisionOnlyCodeCredential('art-user', 'gemini', '聊天主密钥')
  await service.provisionOnlyCodeCredential('art-user', 'gemini', '图片备用密钥')
  await service.provisionOnlyCodeCredential('art-user', 'gemini', '聊天主密钥')

  assert.equal(saved.length, 2)
  assert.equal(remoteCalls, 2)
  assert.deepEqual(saved.map((item) => item.name), ['聊天主密钥', '图片备用密钥'])
})
