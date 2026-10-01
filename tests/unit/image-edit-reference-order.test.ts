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

function harness() {
  const requests: Array<{ url: string; form: FormData }> = []
  const resolved = {
    source: 'user', type: 'NEW_API', model: 'gpt-image-2', baseUrl: 'https://ai.example/proxy/v1', apiProtocol: 'openai',
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
    requests.push({ url, form: init.body as FormData })
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), { status: 200 })
  }
  return { requests, run: (options: Record<string, unknown>) => runner.run({ id: 'job', userId: 'user', kind: 'IMAGE', model: 'gpt-image-2', prompt: '把这张图的文字去掉', options, lockedBy: 'worker', leaseVersion: 1 } as never) }
}

test('参考图默认按本机在前、库内在后发送', async () => {
  const h = harness()
  await h.run({ size: '1024x1024', referenceImages: [{ id: 'local:1', name: '本机参考.png', mimeType: 'image/png', dataUrl }], referenceAssetIds: ['asset-1'] })

  assert.equal(h.requests[0].url, 'https://ai.example/proxy/v1/images/edits')
  const form = h.requests[0].form
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

  const form = h.requests[0].form
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

  const form = h.requests[0].form
  assert.equal((form.get('image') as File).name, '本机参考.png')
  assert.equal((form.getAll('image[]')[0] as File).name, '库内参考.png')
})
