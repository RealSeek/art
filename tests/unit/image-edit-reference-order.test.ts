import assert from 'node:assert/strict'
import test from 'node:test'
import { ImageGenerationRunner } from '../../server/src/generations/runners/image-generation.runner'
import { ProvidersService, type ResolvedProvider } from '../../server/src/providers/providers.service'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const dataUrl = `data:image/png;base64,${png.toString('base64')}`

const imageCapabilities = {
  sizes: ['1024x1024'],
  qualities: ['medium'],
  outputFormats: ['png'],
  backgrounds: ['opaque'],
  maxCount: 1,
  defaultSize: '1024x1024',
  defaultQuality: 'medium',
  supportsReference: true,
  supportsMask: true,
  resolutionPricing: {},
}

function harness(model = 'gpt-image-2') {
  const requests: Array<{ url: string; body: FormData | Record<string, unknown>; headers: Headers }> = []
  const resolved = {
    source: 'user', type: 'NEW_API', model, baseUrl: 'https://ai.example/proxy/v1', apiProtocol: 'openai',
    apiKey: 'test-key', authType: 'BEARER', headers: {}, timeoutMs: 1000, imageCostMicros: 0, pricingUsdExchangeRateMicros: 1_000_000,
    imageCapabilities,
  } as ResolvedProvider
  const providers = new ProvidersService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  const runner = new ImageGenerationRunner({ generationJob: { findUnique: async () => ({ status: 'RUNNING' }), updateMany: async () => ({ count: 1 }) } } as never,
    { readForUser: async () => ({ file: png, mimeType: 'image/png', name: '库内参考.png' }) } as never,
    providers,
    { cleanup: async () => {}, storeAndLink: async () => ({ id: 'asset' }) } as never,
    {} as never, {} as never, { settleNonChat: async () => {} } as never)
  const internal = runner as any
  internal.withProviderFailover = async (_task: unknown, execute: (provider: ResolvedProvider) => Promise<unknown>) => ({ result: await execute(resolved), provider: resolved, providerAttemptId: 'attempt' })
  internal.providerFetch = async (_provider: ResolvedProvider, url: string, init: RequestInit) => {
    requests.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body as FormData, headers: new Headers(init.headers) })
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 })
  }
  return { requests, run: (options: Record<string, unknown>) => runner.run({ id: 'job', userId: 'user', kind: 'IMAGE', model, prompt: '把这张图的文字去掉', options, lockedBy: 'worker', leaseVersion: 1 } as never) }
}

test('参考图默认按本机在前、库内在后发送', async () => {
  const h = harness()
  await h.run({ size: '1024x1024', referenceImages: [{ id: 'local:1', name: '本机参考.png', mimeType: 'image/png', dataUrl }], referenceAssetIds: ['asset-1'] })

  assert.equal(h.requests[0].url, 'https://ai.example/proxy/v1/images/edits')
  const form = h.requests[0].body as FormData
  assert.equal((form.get('image') as File).name, '本机参考.png')
  assert.equal((form.getAll('image[]')[0] as File).name, '库内参考.png')
})

test('带蒙版时蒙版底图排到第一位，蒙版只能落在底图上', async () => {
  const h = harness()
  await h.run({
    size: '1024x1024',
    referenceImages: [{ id: 'local:1', name: '本机参考.png', mimeType: 'image/png', dataUrl }],
    referenceAssetIds: ['asset-1'],
    maskImage: { name: 'mask.png', mimeType: 'image/png', dataUrl },
    maskReferenceId: 'asset-1',
  })

  const form = h.requests[0].body as FormData
  assert.equal((form.get('image') as File).name, '库内参考.png')
  assert.equal((form.getAll('image[]')[0] as File).name, '本机参考.png')
  assert.equal((form.get('mask') as File).name, 'mask.png')
})

test('蒙版底图是本机素材时保持本机在前', async () => {
  const h = harness()
  await h.run({
    size: '1024x1024',
    referenceImages: [{ id: 'local:1', name: '本机参考.png', mimeType: 'image/png', dataUrl }],
    referenceAssetIds: ['asset-1'],
    maskImage: { name: 'mask.png', mimeType: 'image/png', dataUrl },
    maskReferenceId: 'local:1',
  })

  const form = h.requests[0].body as FormData
  assert.equal((form.get('image') as File).name, '本机参考.png')
  assert.equal((form.getAll('image[]')[0] as File).name, '库内参考.png')
})

test('Seedream 各版本文生图都使用 JSON generations，不发送 GPT 专有参数', async () => {
  for (const model of ['seedream-4.5', 'seedream-5.0-lite', 'seedream-5-0-pro', 'doubao-seedream-4-5-251128']) {
    const h = harness(model)
    await h.run({ size: '1024x1024', outputFormat: 'png', outputCompression: 90 })
    assert.equal(h.requests.length, 1)
    assert.equal(h.requests[0].url, 'https://ai.example/proxy/v1/images/generations')
    assert.equal(h.requests[0].headers.get('content-type'), 'application/json')
    assert.deepEqual(h.requests[0].body, { model, prompt: '把这张图的文字去掉', n: 1, size: '1024x1024', response_format: 'url' })
  }
})

test('Seedream 单张参考图通过 generations 的 image 字段发送', async () => {
  const h = harness('seedream-4.5')
  await h.run({ referenceImages: [{ name: 'reference.png', mimeType: 'image/png', dataUrl }] })
  assert.equal(h.requests[0].url, 'https://ai.example/proxy/v1/images/generations')
  assert.equal((h.requests[0].body as Record<string, unknown>).image, dataUrl)
})

test('Seedream 四张参考图通过 JSON image 数组发送，本机在前、库内在后', async () => {
  const h = harness('seedream-4.5')
  const localImages = ['first', 'second', 'third'].map((value) => ({ name: `${value}.webp`, mimeType: 'image/webp', dataUrl: `data:image/webp;base64,${Buffer.from(value).toString('base64')}` }))
  await h.run({ referenceImages: localImages, referenceAssetIds: ['asset-1'] })
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].url, 'https://ai.example/proxy/v1/images/generations')
  assert.deepEqual((h.requests[0].body as Record<string, unknown>).image, [...localImages.map((image) => image.dataUrl), dataUrl])
})

test('Seedream 蒙版请求明确失败，不会静默忽略蒙版', async () => {
  const h = harness('seedream-4.5')
  for (const mask of [{ maskImage: { name: 'mask.png', mimeType: 'image/png', dataUrl } }, { maskAssetId: 'mask-1' }]) {
    await assert.rejects(() => h.run({ referenceImages: [{ name: 'reference.png', mimeType: 'image/png', dataUrl }], ...mask }), /Seedream 不支持蒙版编辑/)
  }
  assert.equal(h.requests.length, 0)
})
