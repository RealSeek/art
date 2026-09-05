import assert from 'node:assert/strict'
import test from 'node:test'
import { ImageGenerationRunner } from '../../server/src/generations/runners/image-generation.runner'
import { ProvidersService, type ResolvedProvider } from '../../server/src/providers/providers.service'
import { isGeminiImageModel } from '../../server/src/generations/image-options'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')

function harness(model = 'gemini-3-pro-image-preview', baseUrl = 'https://ai.example/proxy/v1', apiProtocol = 'openai') {
  const requests: Array<{ url: string; body: any; headers: Headers }> = []
  const stored: Uint8Array[] = []
  const assetReads: string[] = []
  let payload: unknown = { candidates: [{ content: { parts: [{ text: '生成完成' }, { thought: true, inlineData: { mimeType: 'image/png', data: png.toString('base64') } }, { inlineData: { mimeType: 'image/png', data: png.toString('base64') } }] } }] }
  const resolved = { source: 'user', type: 'NEW_API', model, baseUrl, apiProtocol, apiKey: 'test-key', authType: 'BEARER', headers: {}, timeoutMs: 1000, imageCostMicros: 0, pricingUsdExchangeRateMicros: 1_000_000 } as ResolvedProvider
  const providers = new ProvidersService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  const runner = new ImageGenerationRunner({ generationJob: { findUnique: async () => ({ status: 'RUNNING' }), updateMany: async () => ({ count: 1 }) } } as never,
    { readForUser: async (userId: string, id: string) => { assert.equal(userId, 'user'); assetReads.push(id); return { file: png, mimeType: 'image/png', name: 'reference.png' } } } as never,
    providers,
    { cleanup: async () => {}, storeAndLink: async (_task: unknown, input: { data: Uint8Array }) => { stored.push(input.data); return { id: 'asset' } } } as never,
    {} as never, {} as never, { settleNonChat: async () => {} } as never)
  const internal = runner as any
  internal.withProviderFailover = async (_task: unknown, execute: (provider: ResolvedProvider) => Promise<unknown>) => ({ result: await execute(resolved), provider: resolved, providerAttemptId: 'attempt' })
  internal.providerFetch = async (provider: ResolvedProvider, url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) })
    return new Response(JSON.stringify(payload), { status: 200 })
  }
  return { requests, stored, assetReads, setPayload: (value: unknown) => { payload = value }, run: (options = {}) => runner.run({ id: 'job', userId: 'user', kind: 'IMAGE', model, prompt: '画一个蓝色方块', options, lockedBy: 'worker', leaseVersion: 1 } as never) }
}

test('旧 OnlyCode Gemini 模型自动走原生生图，保留代理前缀和认证', async () => {
  const h = harness()
  await h.run({ size: '1536x1024', referenceAssetIds: ['reference'] })
  assert.equal(h.requests.length, 1)
  const request = h.requests[0]
  assert.equal(request.url, 'https://ai.example/proxy/v1beta/models/gemini-3-pro-image-preview:generateContent')
  assert.equal(request.headers.get('authorization'), 'Bearer test-key')
  assert.equal(request.headers.get('x-goog-api-key'), 'test-key')
  assert.deepEqual(request.body.generationConfig, { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '3:2', imageSize: '1K' } })
  assert.deepEqual(request.body.contents[0].parts[1], { inlineData: { mimeType: 'image/png', data: png.toString('base64') } })
  assert.deepEqual(h.assetReads, ['reference'])
  assert.equal(h.stored.length, 1)
  assert.deepEqual(Buffer.from(h.stored[0]), png)
})

test('Gemini Flash 保留 v1beta 地址并映射分辨率', async () => {
  const h = harness('gemini-3.1-flash-image-preview', 'https://ai.example/v1beta', 'gemini')
  await h.run({ size: '2048x2048' })
  assert.equal(h.requests[0].url, 'https://ai.example/v1beta/models/gemini-3.1-flash-image-preview:generateContent')
  assert.equal(h.requests[0].body.generationConfig.imageConfig.imageSize, '2K')
})

test('Gemini 无图片和不支持的选项不会被当作成功', async () => {
  const h = harness()
  h.setPayload({ promptFeedback: { blockReason: 'SAFETY' } })
  await assert.rejects(() => h.run(), /Gemini 未返回图片：SAFETY/)
  assert.equal(h.stored.length, 0)
  await assert.rejects(() => h.run({ background: 'transparent' }), /不支持透明背景/)
  await assert.rejects(() => h.run({ count: 2 }), /单次仅支持 1 张/)
  assert.equal(h.requests.length, 1)
})

test('GPT 图片仍使用 OpenAI 图片端点和原请求参数', async () => {
  const h = harness('gpt-image-2')
  h.setPayload({ data: [{ b64_json: png.toString('base64') }] })
  await h.run()
  assert.equal(h.requests[0].url, 'https://ai.example/proxy/v1/images/generations')
  assert.equal(h.requests[0].body.model, 'gpt-image-2')
  assert.equal(h.requests[0].body.prompt, '画一个蓝色方块')
  assert.equal(h.requests[0].headers.has('x-goog-api-key'), false)
  assert.equal(h.stored.length, 1)
  assert.equal(isGeminiImageModel('gemini-3.1-pro-preview'), false)
  assert.equal(isGeminiImageModel('imagen-4'), false)
})

test('OnlyCode 导入时只为 Gemini 图片选择原生协议和参考图能力', async () => {
  const saved: any[] = []
  const service = new ProvidersService({
    userApiCredential: { findFirst: async () => ({ providerType: 'NEW_API', name: 'OnlyCode', priority: 0, weight: 100 }) },
    userModel: { findMany: async () => [], findFirst: async () => null, create: async ({ data }: any) => { saved.push(data); return { id: `model-${saved.length}`, ...data } } },
    modelVendor: { upsert: async () => ({ id: 'vendor' }) },
    userModelRoute: { upsert: async () => {} },
  } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  service.userPolicy = (async () => ({ allowUserByok: true })) as typeof service.userPolicy
  service.discoverCredentialModels = (async () => ({ candidates: ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gpt-image-2'].map((id) => ({ id, capability: 'IMAGE', importable: true, displayName: id, vendorKey: 'test', vendorName: 'test' })), models: [] })) as unknown as typeof service.discoverCredentialModels
  await service.importCredentialModels('user', 'credential', { importAll: true })
  assert.deepEqual(saved.map((model) => model.apiProtocol), ['gemini', 'gemini', 'openai'])
  assert.deepEqual(saved.map((model) => model.options.imageCapabilities.supportsReference), [true, true, false])
})
