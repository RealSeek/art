import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { localWorkerHttpUrl, PublicEndpointPolicyService } from '../../server/src/common/public-endpoint-policy.service'
import { ProvidersService } from '../../server/src/providers/providers.service'

const ProviderType = {
  OPENAI_COMPATIBLE: 'OPENAI_COMPATIBLE',
} as const
const ProviderAuthType = {
  BEARER: 'BEARER',
} as const

const cryptoStub = {
  encrypt: (value: string) => `encrypted:${value}`,
  hint: (value: string) => value.slice(0, 4),
  decrypt: (value: string) => value.replace(/^encrypted:/, ''),
}

function providerInput(baseUrl: string) {
  return {
    name: 'Test Provider',
    type: ProviderType.OPENAI_COMPATIBLE as never,
    baseUrl,
    apiKey: 'provider-secret',
    authType: ProviderAuthType.BEARER as never,
    enabled: true,
  }
}

function createService(prisma: Record<string, unknown>, endpointPolicy: PublicEndpointPolicyService = new PublicEndpointPolicyService()) {
  const config = { get: (_key: string, fallback = '') => fallback }
  return new ProvidersService(
    prisma as never,
    cryptoStub as never,
    config as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    endpointPolicy,
  )
}

test('admin provider creation rejects loopback, private, and metadata endpoints before persistence', async () => {
  let createCalls = 0
  const service = createService({ providerTemplate: { findUnique: async () => null }, providerChannel: { create: async () => { createCalls += 1 } } })

  for (const baseUrl of [
    'http://127.0.0.1:3100',
    'http://10.0.0.8:8080',
    'http://169.254.169.254/latest/meta-data',
  ]) await assert.rejects(() => service.createProvider(providerInput(baseUrl)), /非公网地址/)

  assert.equal(createCalls, 0)
})

test('changing an admin provider endpoint clears its retained credential', async () => {
  let updateData: Record<string, unknown> | undefined
  const service = createService({
    providerTemplate: { findUnique: async () => null },
    providerChannel: {
      findUnique: async () => ({
        id: 'provider-1',
        name: 'Old Provider',
        type: ProviderType.OPENAI_COMPATIBLE,
        baseUrl: 'https://old.example/v1',
        encryptedApiKey: 'encrypted:old-secret',
        apiKeyHint: 'old-',
        metadata: {},
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData = data
        return { id: 'provider-1', encryptedApiKey: String(data.encryptedApiKey || ''), ...data }
      },
    },
  }, { assertPublicHttpUrl: async (value: string) => new URL(value) } as PublicEndpointPolicyService)

  await service.updateProvider('provider-1', { baseUrl: 'https://new.example/v1' })
  assert.equal(updateData?.encryptedApiKey, '')
  assert.equal(updateData?.apiKeyHint, '')
  assert.match(String(updateData?.lastHealthMessage), /重新配置 API 密钥/)
})

test('local worker endpoints require an exact allowed host or host and port', () => {
  assert.equal(localWorkerHttpUrl('http://image-worker:8080/v1', ['image-worker']).hostname, 'image-worker')
  assert.equal(localWorkerHttpUrl('http://custom-worker:9000/v1', ['custom-worker:9000']).port, '9000')
  assert.throws(() => localWorkerHttpUrl('http://127.0.0.1:8080/v1', ['image-worker']), /允许列表/)
  assert.throws(() => localWorkerHttpUrl('http://metadata.internal/v1', ['image-worker']), /允许列表/)
})

test('public Provider result downloads keep socket-level public DNS validation', () => {
  for (const file of [
    'server/src/generations/runners/image-generation.runner.ts',
    'server/src/generations/runners/video-generation.runner.ts',
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /resolved\.type === ProviderType\.LOCAL_WORKER \? fetchNoRedirect : fetchPublicNoRedirect/)
    assert.doesNotMatch(source, /resolved\.source !== 'user' \? fetchNoRedirect : fetchPublicNoRedirect/)
  }
})
