import assert from 'node:assert/strict'
import test from 'node:test'
import type { ModelCapability, ProviderType } from '@prisma/client'
import { ProvidersService } from '../../server/src/providers/providers.service'
import type { DiscoveredModel } from '../../server/src/providers/model-discovery.service'

function candidate(id: string, capability: ModelCapability = 'CHAT'): DiscoveredModel {
  return {
    id,
    displayName: id,
    vendorKey: 'openai',
    vendorName: 'OpenAI',
    capability,
    importable: true,
    confidence: 'exact',
    pricingSource: 'litellm',
    inputCostMicrosPerMillion: 1,
    outputCostMicrosPerMillion: 2,
    imageCostMicros: 0,
    videoCostMicros: 0,
    inputCreditsPerMillion: 1,
    outputCreditsPerMillion: 2,
    flatCreditCost: 1,
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    features: [],
    agentCapabilities: null,
    warnings: [],
    raw: {},
  }
}

function service(prisma: Record<string, unknown>) {
  return new ProvidersService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
}

test('已有 Seedance 模型同步升级原生能力并保留售价和原路由', async () => {
  const credential = { id: 'credential-1', userId: 'user-1', name: 'OnlyCode', priority: 0, weight: 100, providerType: 'NEW_API', template: null, suppressedModels: [] }
  const existing = { id: 'model-1', key: 'private:seedance', capability: 'VIDEO', options: { discovery: { vendorKey: 'doubao' }, videoCapabilities: { resolutions: ['720p'], pricing: { '720p:5': 12 } } } }
  let updated: Record<string, any> | undefined
  const prisma = {
    userApiCredential: { findFirst: async () => credential, update: async () => credential },
    modelVendor: { upsert: async () => ({ id: 'vendor-1' }) },
    userModel: { findMany: async () => [], findFirst: async () => existing, update: async ({ data }: { data: Record<string, unknown> }) => { updated = data; return existing } },
    userModelRoute: { count: async () => 1, findMany: async () => [] },
  }
  const providers = service(prisma)
  providers.discoverCredentialModels = async () => ({ models: ['Seedance-2.5'], candidates: [candidate('Seedance-2.5', 'VIDEO')], latencyMs: 1 })
  await providers.syncCredentialModels('user-1', 'credential-1')
  assert.equal(updated?.options.videoCapabilities.referenceMode, 'CONTENT_JSON')
  assert.equal(updated?.options.videoCapabilities.requestFormat, 'seedance')
  assert.equal(updated?.options.videoCapabilities.maxDuration, 30)
  assert.deepEqual(updated?.options.videoCapabilities.pricing, { '720p:5': 12 })
  assert.deepEqual(updated?.options.discovery, { vendorKey: 'doubao' })
})

test('NewAPI 模型列表无权限时只从公开目录刷新既有视频能力', async () => {
  const credential = { id: 'credential-1', userId: 'user-1', name: '视频', priority: 0, weight: 100, providerType: 'NEW_API', template: null, suppressedModels: [] }
  const updates: Array<Record<string, unknown>> = []
  const prisma = {
    userApiCredential: {
      findFirst: async () => credential,
      update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return credential },
    },
  }
  const providers = service(prisma)
  providers.discoverCredentialModels = async () => { throw new Error('HTTP 403: 无权访问视频分组') }
  const refreshed = candidate('MiniMax-Hailuo-2.3', 'VIDEO')
  refreshed.raw.videoCapabilities = { maxReferences: 9 }
  ;(providers as unknown as { refreshExistingCredentialVideoCapabilities: () => Promise<DiscoveredModel[]> }).refreshExistingCredentialVideoCapabilities = async () => [refreshed]

  const result = await providers.syncCredentialModels('user-1', 'credential-1')

  assert.deepEqual(result, { discovered: 1, availableModels: ['MiniMax-Hailuo-2.3'], imported: 0, removed: 0, capabilityOnly: true })
  assert.equal(updates.length, 1)
  assert.equal(updates[0].lastHealthStatus, null)
  assert.match(String(updates[0].lastHealthMessage), /公开能力目录刷新 1 个/)
})

test('个人模型同步会新增上游新模型并删除已下线模型，且不复活手动删除的模型', async () => {
  const credential = {
    id: 'credential-1', userId: 'user-1', name: 'onlyart-codex', priority: 0, weight: 100,
    providerType: 'NEW_API' as ProviderType, template: null, suppressedModels: ['gpt-removed-by-user'],
  }
  const routes = [
    { id: 'route-gone', userModelId: 'model-gone', upstreamModel: 'gpt-retired' },
    { id: 'route-kept', userModelId: 'model-kept', upstreamModel: 'gpt-keep' },
  ]
  const created: Array<Record<string, unknown>> = []
  const upsertedRoutes: Array<Record<string, unknown>> = []
  const deletedRoutes: string[][] = []
  const deletedModels: string[] = []
  const prisma = {
    userApiCredential: { findFirst: async () => credential, update: async () => credential },
    modelVendor: { upsert: async () => ({ id: 'vendor-1' }) },
    userModel: {
      // 默认能力查询返回空，只剩孤儿的模型查询返回待清理的模型。
      findMany: async ({ where }: { where: Record<string, unknown> }) => where.isDefault === true
        ? []
        : [{ id: 'model-gone', capability: 'CHAT', isDefault: false }],
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: `model-${data.key}`, key: data.key }
      },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedModels.push(...where.id.in)
        return { count: where.id.in.length }
      },
      update: async () => ({}),
    },
    userModelRoute: {
      count: async () => 0,
      findMany: async () => routes,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        upsertedRoutes.push(create)
        return create
      },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedRoutes.push(where.id.in)
        return { count: where.id.in.length }
      },
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  }
  const providers = service(prisma)
  providers.discoverCredentialModels = async () => ({
    models: ['gpt-new', 'gpt-keep', 'gpt-removed-by-user'],
    candidates: [candidate('gpt-new'), candidate('gpt-keep'), candidate('gpt-removed-by-user')],
    latencyMs: 12,
  })

  const result = await providers.syncCredentialModels('user-1', 'credential-1')

  assert.deepEqual(created.map((row) => row.displayName), ['gpt-new', 'gpt-keep'])
  assert.deepEqual(upsertedRoutes.map((row) => row.upstreamModel), ['gpt-new', 'gpt-keep'])
  assert.deepEqual(deletedRoutes, [['route-gone']])
  assert.deepEqual(deletedModels, ['model-gone'])
  assert.deepEqual(result, { discovered: 3, availableModels: ['gpt-new', 'gpt-keep', 'gpt-removed-by-user'], imported: 2, removed: 1 })
})

test('渠道模型同步会停用上游已下线的预设，并给上游新模型建路由', async () => {
  const provider = { id: 'provider-1', metadata: null, template: null }
  const routes = [
    { id: 'route-live', modelPresetId: 'preset-live', upstreamModelOverride: 'gpt-live', modelPreset: { providerId: 'provider-1', upstreamModel: 'gpt-live' } },
    { id: 'route-retired', modelPresetId: 'preset-retired', upstreamModelOverride: 'gpt-retired', modelPreset: { providerId: 'provider-1', upstreamModel: 'gpt-retired' } },
  ]
  const createdPresets: Array<Record<string, unknown>> = []
  const upsertedRoutes: Array<Record<string, unknown>> = []
  const disabledPresets: string[] = []
  const prisma = {
    providerChannel: { findUnique: async () => provider, update: async () => provider },
    modelVendor: { upsert: async () => ({ id: 'vendor-1' }) },
    modelPreset: {
      findMany: async () => [],
      findFirst: async ({ where }: { where: { OR?: Array<{ upstreamModel?: string }> } }) => {
        const upstream = where.OR?.map((item) => item.upstreamModel).find(Boolean)
        return upstream === 'gpt-live' ? { id: 'preset-live', key: 'gpt-live', enabled: true, badge: '自动定价' } : null
      },
      count: async () => 0,
      updateMany: async ({ where }: { where: { id?: string } }) => {
        if (where.id) disabledPresets.push(where.id)
        return { count: 1 }
      },
      update: async () => ({}),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdPresets.push(data)
        return { id: `preset-${data.key}`, key: data.key, enabled: true }
      },
    },
    modelPriceVersion: { create: async () => ({}) },
    modelProviderRoute: {
      findMany: async () => routes,
      count: async ({ where }: { where: { modelPresetId: string } }) =>
        routes.filter((route) => route.modelPresetId === where.modelPresetId && route.id !== 'route-retired').length,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        upsertedRoutes.push(create)
        return create
      },
      deleteMany: async () => ({ count: 1 }),
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  }
  const providers = service(prisma)
  providers.fetchRemoteModels = async () => ({ models: ['gpt-new', 'gpt-live'], candidates: [candidate('gpt-new'), candidate('gpt-live')], latencyMs: 8 })

  const result = await providers.syncProviderModels('provider-1')

  assert.deepEqual(createdPresets.map((row) => row.upstreamModel), ['gpt-new'])
  assert.deepEqual(upsertedRoutes.map((row) => row.upstreamModelOverride), ['gpt-new', 'gpt-live'])
  assert.deepEqual(disabledPresets, ['preset-retired'])
  assert.deepEqual(result, { discovered: 2, imported: 1, routed: 2, removed: 1 })
})

test('删除个人模型会记录上游模型，避免自动同步重新导入', async () => {
  const suppressed: Array<{ id: string; suppressedModels: string[] }> = []
  const prisma = {
    userModel: {
      findFirst: async () => ({ id: 'model-1', routes: [{ credentialId: 'credential-1', upstreamModel: 'gpt-4o' }] }),
      deleteMany: async () => ({ count: 1 }),
    },
    userApiCredential: {
      findUnique: async () => ({ suppressedModels: ['gpt-4o-mini'] }),
      update: async ({ where, data }: { where: { id: string }; data: { suppressedModels: string[] } }) => {
        suppressed.push({ id: where.id, suppressedModels: data.suppressedModels })
        return {}
      },
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  }
  const providers = service(prisma)

  await providers.deletePrivateModel('user-1', 'model-1')

  assert.deepEqual(suppressed, [{ id: 'credential-1', suppressedModels: ['gpt-4o-mini', 'gpt-4o'] }])
})

test('导入与同步只为真正的编辑类图片模型开启蒙版能力', async () => {
  const created: Array<Record<string, unknown>> = []
  const credential = { id: 'credential-1', userId: 'user-1', name: 'onlyart-生图', priority: 0, weight: 100, providerType: 'NEW_API' as ProviderType, template: null, suppressedModels: [] }
  const prisma = {
    userApiCredential: { findFirst: async () => credential, update: async () => credential },
    modelVendor: { upsert: async () => ({ id: 'vendor-1' }) },
    userModel: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: `model-${created.length}`, key: data.key }
      },
    },
    userModelRoute: { upsert: async () => ({}), findMany: async () => [], count: async () => 0, deleteMany: async () => ({ count: 0 }) },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  }
  const providers = service(prisma)
  providers.discoverCredentialModels = async () => ({
    models: ['gpt-image-2.5', 'grok-imagine-image-2.0', 'gemini-3-pro-image-preview'],
    candidates: [
      candidate('gpt-image-2.5', 'IMAGE' as ModelCapability),
      candidate('grok-imagine-image-2.0', 'IMAGE' as ModelCapability),
      candidate('gemini-3-pro-image-preview', 'IMAGE' as ModelCapability),
    ],
    latencyMs: 5,
  })

  await providers.syncCredentialModels('user-1', 'credential-1')

  const capabilities = created.map((row) => (row.options as { imageCapabilities: Record<string, unknown> }).imageCapabilities)
  assert.deepEqual(capabilities.map((item) => item.supportsMask), [true, false, false])
  assert.deepEqual(capabilities.map((item) => item.supportsReference), [true, true, true])
  // 多档家族（gpt-image / gemini）开放 1K/2K/4K 尺寸与分档定价，其余保持单档。
  assert.deepEqual(capabilities.map((item) => (item.sizes as string[]).length), [15, 1, 15])
  assert.deepEqual(capabilities.map((item) => (item.resolutionPricing as Record<string, number>)['2K'] || 0), [2, 0, 2])
})

test('同步会把已有图片模型升级到新的蒙版与参考图能力', async () => {
  const credential = { id: 'credential-1', userId: 'user-1', name: 'onlyart-生图', priority: 0, weight: 100, providerType: 'NEW_API' as ProviderType, template: null, suppressedModels: [] }
  const existing = { id: 'model-1', key: 'private:x:gpt-image-2-5:abc', capability: 'IMAGE' as ModelCapability, options: { imageCapabilities: { supportsMask: false, supportsReference: false, sizes: ['1024x1024'] } } }
  const updated: Array<Record<string, unknown>> = []
  const prisma = {
    userApiCredential: { findFirst: async () => credential, update: async () => credential },
    userModel: {
      findMany: async () => [],
      findFirst: async () => existing,
      create: async () => { throw new Error('已有模型不应被重复创建') },
      update: async ({ data }: { data: Record<string, unknown> }) => { updated.push(data); return existing },
    },
    userModelRoute: {
      count: async () => 1,
      upsert: async () => { throw new Error('已有路由不应被重写') },
      findMany: async () => [{ id: 'route-1', userModelId: 'model-1', upstreamModel: 'gpt-image-2.5' }],
      deleteMany: async () => ({ count: 0 }),
    },
    modelVendor: { upsert: async () => ({ id: 'vendor-1' }) },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  }
  const providers = service(prisma)
  providers.discoverCredentialModels = async () => ({ models: ['gpt-image-2.5'], candidates: [candidate('gpt-image-2.5', 'IMAGE' as ModelCapability)], latencyMs: 5 })

  const result = await providers.syncCredentialModels('user-1', 'credential-1')

  const options = updated[0].options as { imageCapabilities: Record<string, unknown> }
  assert.equal(options.imageCapabilities.supportsMask, true)
  assert.equal(options.imageCapabilities.supportsReference, true)
  assert.deepEqual(options.imageCapabilities.sizes, ['1024x1024'])
  assert.equal(result.removed, 0)
})
