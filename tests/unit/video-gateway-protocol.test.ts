import assert from 'node:assert/strict'
import test from 'node:test'
import { ProvidersService } from '../../server/src/providers/providers.service'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'
import { ReconciliationRequiredError } from '../../server/src/generations/generation-provider-errors'
import { newApiNativeVideoCapabilities, videoCapabilities } from '../../server/src/generations/video-options'

test('NewAPI 仅从可见渠道的明确协议声明识别网关，混合渠道保留配置', async () => {
  const originalFetch = globalThis.fetch
  const providers = ProvidersService.prototype as unknown as {
    attachNewApiVideoCapabilities(base: string, headers: Record<string, string>, candidates: Array<{ id: string; raw: Record<string, unknown> }>): Promise<void>
    discoveredModelOptions(candidate: unknown, protocol: string, type: string): { videoCapabilities: Record<string, unknown> }
  }
  try {
    globalThis.fetch = async () => Response.json({ data: [
      { model_name: 'seedance-2.5', channel_video_capabilities: [{ request_protocol: 'openai_video' }] },
      { model_name: 'MiniMax-H3', channel_video_capabilities: [{ request_protocol: 'openai_video', capabilities: { reference_images: 9 } }] },
      { model_name: 'wan2.7-i2v', channel_video_capabilities: [{ request_protocol: 'openai_video' }, {}] },
    ] })
    const candidates = ['seedance-2.5', 'MiniMax-H3', 'wan2.7-i2v'].map(id => ({ id, capability: 'VIDEO', raw: {} as Record<string, unknown> }))
    await providers.attachNewApiVideoCapabilities('https://newapi.example/v1', {}, candidates)
    for (const candidate of candidates.slice(0, 2)) {
      const caps = videoCapabilities(providers.discoveredModelOptions(candidate, 'openai', 'NEW_API').videoCapabilities)
      assert.equal(caps.requestProtocol, 'openai_video')
      assert.equal(caps.createPath, '/videos')
      assert.equal(caps.statusPath, '/videos/{id}')
    }
    assert.equal(videoCapabilities(providers.discoveredModelOptions(candidates[0], 'openai', 'NEW_API').videoCapabilities).maxReferences, 30)
    const mixed = providers.discoveredModelOptions(candidates[2], 'openai', 'NEW_API').videoCapabilities
    assert.equal(mixed.requestProtocol, null)
    assert.equal(mixed.createPath, '/ali/api/v1/services/aigc/video-generation/video-synthesis')
    const explicit = newApiNativeVideoCapabilities('seedance-2.5', { requestProtocol: 'openai_video' })!
    assert.equal(explicit.createPath, '/videos')
  } finally { globalThis.fetch = originalFetch }
})

test('网关视频提交 prompt 与有序扩展素材，保留提示词并使用统一任务入口', async () => {
  const cases = [
    {
      model: 'seedance-2.5', options: { duration: -1, aspectRatio: 'adaptive', referenceImageUrls: ['https://cdn.example/a.png', 'https://cdn.example/b.png'], referenceVideoUrls: ['https://cdn.example/move.mp4'], referenceAudioUrls: ['https://cdn.example/sound.mp3'], generateAudio: false, watermark: false, returnLastFrame: true, videoTaskType: 'edit', videoFormat: 'mov' },
      expected: { seconds: '-1', resolution: '720p', aspect_ratio: 'adaptive', images: [{ url: 'https://cdn.example/a.png', role: 'reference_image' }, { url: 'https://cdn.example/b.png', role: 'reference_image' }], videos: ['https://cdn.example/move.mp4'], audios: ['https://cdn.example/sound.mp3'], generate_audio: false, watermark: false, return_last_frame: true, output_format: 'mov', omni_reference_task_type: 'edit' },
    },
    {
      model: 'MiniMax-H3', options: { duration: 1, aspectRatio: 'adaptive', imageRole: 'first_last_frame', referenceImageUrls: ['https://cdn.example/a.png', 'https://cdn.example/b.png'] },
      expected: { seconds: '1', resolution: '768p', aspect_ratio: 'adaptive', images: [{ url: 'https://cdn.example/a.png', role: 'first_frame' }, { url: 'https://cdn.example/b.png', role: 'last_frame' }] },
    },
  ]
  for (const row of cases) {
    const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => {} } as never, {} as never, {} as never, {} as never)
    const internals = runner as unknown as {
      withProviderFailover(task: unknown, kind: string, execute: (resolved: unknown) => Promise<unknown>): Promise<unknown>
      provider(resolved: unknown, path: string, body: Record<string, unknown>, timeout: number, key: string): Promise<unknown>
    }
    internals.withProviderFailover = async (_task, _kind, execute) => execute({ model: row.model, timeoutMs: 1000, videoCapabilities: newApiNativeVideoCapabilities(row.model, { requestProtocol: 'openai_video' }) })
    internals.provider = async (_resolved, path, body, _timeout, key) => {
      assert.equal(path, '/videos')
      assert.equal(key, 'art-video-gateway-job')
      assert.deepEqual(body, { model: row.model, prompt: '@参考图0 follows @参考视频0', ...row.expected })
      return { status: 'failed', error: { message: 'captured gateway request' } }
    }
    await assert.rejects(runner.run({ id: 'gateway-job', prompt: '@参考图0 follows @参考视频0', options: row.options } as never), /captured gateway request/)
  }
})

const seedanceScenes: Array<{
  name: string
  options: Record<string, unknown>
  expectedTaskType?: 'auto' | 'reference' | 'edit' | 'extend'
  invalidReference?: boolean
}> = [
  { name: '纯文本 auto', options: { videoTaskType: 'auto' } },
  { name: '首帧 auto', options: { videoTaskType: 'auto', imageRole: 'first_frame', aspectRatio: 'adaptive', referenceImageUrls: ['https://cdn.example/first.png'] } },
  { name: '首尾帧 auto', options: { videoTaskType: 'auto', imageRole: 'first_last_frame', aspectRatio: 'adaptive', referenceImageUrls: ['https://cdn.example/first.png', 'https://cdn.example/last.png'] } },
  { name: '普通参考 auto', options: { videoTaskType: 'auto', referenceImageUrls: ['https://cdn.example/reference.png'] }, expectedTaskType: 'auto' },
  { name: '普通参考 reference', options: { videoTaskType: 'reference', referenceImageUrls: ['https://cdn.example/reference.png'] }, expectedTaskType: 'reference' },
  { name: '编辑视频', options: { videoTaskType: 'edit', duration: -1, aspectRatio: 'adaptive', referenceVideoUrls: ['https://cdn.example/source.mp4'] }, expectedTaskType: 'edit' },
  { name: '延长视频', options: { videoTaskType: 'extend', duration: 6, aspectRatio: 'adaptive', referenceVideoUrls: ['https://cdn.example/source.mp4'] }, expectedTaskType: 'extend' },
  { name: '纯文本 reference', options: { videoTaskType: 'reference' }, invalidReference: true },
  { name: '首帧 reference', options: { videoTaskType: 'reference', imageRole: 'first_frame', aspectRatio: 'adaptive', referenceImageUrls: ['https://cdn.example/first.png'] }, invalidReference: true },
  { name: '首尾帧 reference', options: { videoTaskType: 'reference', imageRole: 'first_last_frame', aspectRatio: 'adaptive', referenceImageUrls: ['https://cdn.example/first.png', 'https://cdn.example/last.png'] }, invalidReference: true },
]

for (const gateway of [true, false]) for (const scene of seedanceScenes) {
  test(`Seedance 2.5 ${gateway ? '统一' : '原生'}请求按场景处理 ${scene.name}`, async () => {
    const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => {} } as never, {} as never, {} as never, {} as never)
    const internals = runner as unknown as {
      withProviderFailover(task: unknown, kind: string, execute: (resolved: unknown) => Promise<unknown>): Promise<unknown>
      provider(resolved: unknown, path: string, body: Record<string, unknown>): Promise<unknown>
    }
    internals.withProviderFailover = async (_task, _kind, execute) => execute({
      type: 'NEW_API', model: 'seedance-2.5',
      videoCapabilities: newApiNativeVideoCapabilities('seedance-2.5', gateway ? { requestProtocol: 'openai_video' } : {}),
    })
    let providerCalls = 0
    internals.provider = async (_resolved, path, body) => {
      providerCalls += 1
      assert.equal(path, gateway ? '/videos' : '/doubao/api/v3/contents/generations/tasks')
      assert.equal(body.model, 'seedance-2.5')
      assert.equal(Object.hasOwn(body, 'content'), !gateway)
      assert.equal(Object.hasOwn(body, 'omni_reference_task_type'), scene.expectedTaskType !== undefined)
      assert.equal(body.omni_reference_task_type, scene.expectedTaskType)
      return { status: 'failed', error: { message: 'captured scene request' } }
    }
    await assert.rejects(runner.run({ id: 'scene-job', prompt: 'a lake', options: scene.options } as never),
      scene.invalidReference ? /参考生成需要普通参考/ : /captured scene request/)
    assert.equal(providerCalls, scene.invalidReference ? 0 : 1)
  })
}

test('网关创建结果不明时即使使用普通参考模式也禁止换渠道重建', async () => {
  const originalFetch = globalThis.fetch
  const runner = new VideoGenerationRunner({} as never, {} as never, { buildRequestHeaders: () => ({}) } as never, {} as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as {
    provider(resolved: unknown, path: string, body: unknown): Promise<unknown>
    canFailover(error: unknown): boolean
  }
  const resolved = { type: 'LOCAL_WORKER', baseUrl: 'http://127.0.0.1/v1', apiKey: 'test', timeoutMs: 1000, videoCapabilities: { requestProtocol: 'openai_video', referenceMode: 'INPUT_REFERENCE' } }
  try {
    for (const failure of ['network', 'server', 'invalid-json']) {
      globalThis.fetch = async () => {
        if (failure === 'network') throw new Error('request outcome unknown')
        return new Response(failure === 'server' ? 'temporarily unavailable' : '{', { status: failure === 'server' ? 503 : 200 })
      }
      await assert.rejects(internals.provider(resolved, '/videos', { model: 'video', prompt: 'a lake' }), error => error instanceof ReconciliationRequiredError && !internals.canFailover(error))
    }
  } finally { globalThis.fetch = originalFetch }
})

test('网关素材下载在同源任务路径携带密钥，跳转 CDN 不携带密钥', async t => {
  const requests: Array<{ url: string; authorization: string | null }> = []
  t.mock.method(globalThis, 'fetch', async (input: URL, init?: RequestInit) => {
    requests.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') })
    return requests.length === 1
      ? new Response(null, { status: 302, headers: { Location: 'https://cdn.example/result.mp4?signature=keep' } })
      : new Response('video', { headers: { 'Content-Type': 'video/mp4' } })
  })
  const runner = new VideoGenerationRunner({} as never, {} as never,
    { buildRequestHeaders: () => ({ Authorization: 'Bearer test-key' }) } as never, {} as never,
    { assertPublicHttpUrl: async (url: string) => new URL(url) } as never, {} as never, {} as never)
  const internal = runner as unknown as { videoBytes(url: string, resolved: unknown): Promise<{ bytes: Uint8Array }> }
  const result = await internal.videoBytes('https://newapi.example/v1/media/tasks/gwm_task-1/content/0', {
    type: 'NEW_API', baseUrl: 'https://newapi.example/v1', timeoutMs: 1000, videoCapabilities: { requestProtocol: 'openai_video' },
  })
  assert.equal(Buffer.from(result.bytes).toString(), 'video')
  assert.deepEqual(requests, [
    { url: 'https://newapi.example/v1/media/tasks/gwm_task-1/content/0', authorization: 'Bearer test-key' },
    { url: 'https://cdn.example/result.mp4?signature=keep', authorization: null },
  ])
})
