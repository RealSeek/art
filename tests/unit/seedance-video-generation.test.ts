import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'
import { normalizeVideoOptions, sdgoVideoCapabilities, seedanceVideoCapabilities, videoCapabilities } from '../../server/src/generations/video-options'
import { ProvidersService, type ResolvedProvider } from '../../server/src/providers/providers.service'
import { ReconciliationRequiredError, TerminalProviderJobError } from '../../server/src/generations/generation-provider-errors'

test('Seedance 2.0 / 2.5 自动导入原生协议和完整创作规格', () => {
  const discover = ProvidersService.prototype as unknown as { discoveredModelOptions: (model: unknown) => { videoCapabilities: Record<string, unknown> } }
  for (const [id, maxDuration, imageLimit, audioLimit] of [['[c]Seedance-2.0-fast', 15, 9, 3], ['doubao-seedance-2-5-pro', 30, 30, 10]] as const) {
    const raw = discover.discoveredModelOptions({ id, capability: 'VIDEO', flatCreditCost: 1 }).videoCapabilities
    const caps = videoCapabilities(raw)
    assert.equal(caps.referenceMode, 'REFERENCES_JSON')
    assert.equal(caps.maxDuration, maxDuration)
    assert.equal(caps.maxReferences, imageLimit)
    assert.equal(caps.maxAudioReferences, audioLimit)
    assert.equal(normalizeVideoOptions({ duration: -1, aspectRatio: 'adaptive' }, caps).duration, -1)
    assert.equal(normalizeVideoOptions({ duration: maxDuration }, caps).duration, maxDuration)
  }
  assert.equal(normalizeVideoOptions({ resolution: '4k' }, seedanceVideoCapabilities('seedance-2.0')).resolution, '4k')
  assert.throws(() => normalizeVideoOptions({ duration: 3 }, seedanceVideoCapabilities('seedance-2.0')), /between 4 and 15/)
  assert.throws(() => normalizeVideoOptions({ resolution: '4k' }, seedanceVideoCapabilities('seedance-2.5')), /不支持该分辨率/)
})

test('SDGO 特惠模型导入准确的规格，并限制未开放的功能', () => {
  const discover = ProvidersService.prototype as unknown as { discoveredModelOptions: (model: unknown) => { videoCapabilities: Record<string, unknown> } }
  for (const [id, durations, images] of [['[c]seedance-2.0', [5, 10, 15], 9], ['[c]seedance-2.5', [30], 30]] as const) {
    const caps = videoCapabilities(discover.discoveredModelOptions({ id, capability: 'VIDEO' }).videoCapabilities)
    assert.equal(caps.providerProtocol, 'SDGO')
    assert.deepEqual(caps.durations, durations)
    assert.equal(caps.maxReferences, images)
    assert.equal(caps.maxVideoReferences, 0)
    assert.equal(caps.maxFirstLastFrames, 0)
    assert.equal(normalizeVideoOptions({}, caps).duration, durations[0])
    assert.throws(() => normalizeVideoOptions({ duration: 7 }, caps))
    assert.throws(() => normalizeVideoOptions({ duration: -1 }, caps))
    assert.throws(() => normalizeVideoOptions({ resolution: '1080p' }, caps))
    assert.throws(() => normalizeVideoOptions({ faceRequired: true }, caps), /至少一张参考图/)
  }
})

test('SDGO 通过标准网关协议发送固定时长、参考素材及稳定幂等键', async () => {
  const sent: Array<{ body: Record<string, unknown>; key?: string }> = []
  const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as {
    withProviderFailover: (task: unknown, capability: string, execute: (provider: unknown) => Promise<unknown>) => Promise<unknown>
    provider: (provider: unknown, path: string, body: Record<string, unknown>, timeout: number, key: string) => Promise<unknown>
  }
  internals.withProviderFailover = async (_task, _capability, execute) => execute({ model: '[c]seedance-2.5', timeoutMs: 1000, videoCapabilities: sdgoVideoCapabilities('[c]seedance-2.5') })
  internals.provider = async (_provider, _path, body, _timeout, key) => { sent.push({ body, key }); return { status: 'failed', error: { message: 'test stopped after submission' } } }
  const task = { id: 'sdgo-job', prompt: '生成视频', options: { referenceImages: [{ name: 'a.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==' }], faceRequired: true, generateAudio: true, watermark: false, returnLastFrame: true } }
  for (let i = 0; i < 2; i++) await assert.rejects(runner.run(task as never), /test stopped after submission/)
  assert.equal(sent[0].key, 'art-video-sdgo-job')
  assert.deepEqual(sent[0], sent[1])
  assert.equal(sent[0].body.duration, 30)
  assert.deepEqual(sent[0].body.options, { native_face: true })
  assert.deepEqual(sent[0].body.references, [{ type: 'image', role: 'reference_image', source: 'data:image/png;base64,YQ==' }])
})

test('Seedance 创建、原任务轮询、结果下载与保存遵守文档', async () => {
  let created: Record<string, unknown> | undefined
  let polls = 0
  let stored: Record<string, any> | undefined
  const updates: Record<string, unknown>[] = []
  const server = createServer(async (request, response) => {
    if (request.method === 'POST') {
      assert.equal(request.url, '/v1/videos')
      assert.equal(request.headers.authorization, 'Bearer test-key')
      let body = ''
      for await (const chunk of request) body += chunk
      created = JSON.parse(body)
      response.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'internal-id', task_id: 'public-task', status: 'queued' }))
    } else if (request.url === '/v1/videos/public-task') {
      polls += 1
      if (polls === 1) { response.writeHead(503).end('temporarily unavailable'); return }
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'completed', progress: 100, metadata: { url: '/result.mp4?signature=keep', last_frame_url: 'https://cdn.example/last.jpg' }, usage: { completion_tokens: 12345, seconds: 6 } }))
    } else {
      assert.equal(request.url, '/result.mp4?signature=keep')
      assert.equal(request.headers.authorization, undefined)
      response.writeHead(200, { 'Content-Type': 'video/mp4' }).end('video-bytes')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
    const resolved = { source: 'user', credentialId: 'credential-1', routeId: 'route-1', type: 'LOCAL_WORKER', baseUrl, model: 'Seedance-2.0', apiKey: 'test-key', timeoutMs: 1000, videoCostMicros: 0, pricingUsdExchangeRateMicros: 1_000_000, videoCapabilities: seedanceVideoCapabilities('Seedance-2.0') } as ResolvedProvider
    const runner = new VideoGenerationRunner(
      { generationJob: { updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 } }, findUnique: async () => ({ status: 'RUNNING' }) } } as never,
      { readForUser: async () => ({ file: Buffer.from('saved-image'), mimeType: 'image/png', name: 'saved.png' }) } as never,
      { resolveCandidates: async () => [resolved], buildRequestHeaders: () => ({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' }), recordCandidateResult: async () => undefined } as never,
      { cleanup: async () => undefined, storeAndLink: async (_task: unknown, output: Record<string, any>) => { stored = output; return { id: 'asset-1' } } } as never,
      {} as never,
      { start: async () => ({ id: 'attempt-1' }), succeed: async () => undefined } as never,
      { settleNonChat: async () => undefined } as never,
    )
    ;(runner as unknown as { pollDelay: () => number }).pollDelay = () => 1
    await runner.run({ id: 'job-1', userId: 'user-1', prompt: '保持主体外观', options: {
      duration: 6, referenceImages: [{ name: 'local.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,bG9jYWw=' }], referenceAssetIds: ['saved-image'],
      referenceAudios: [{ name: 'sound.wav', mimeType: 'audio/wav', dataUrl: 'data:audio/wav;base64,YQ==' }],
      referenceVideoUrls: ['https://cdn.example/input.mp4?signature=input'], generateAudio: false, watermark: false, returnLastFrame: true,
    } } as never)
    assert.deepEqual(created, {
      model: 'Seedance-2.0', prompt: '保持主体外观', references: [
        { type: 'image', role: 'reference_image', source: 'data:image/png;base64,bG9jYWw=' },
        { type: 'image', role: 'reference_image', source: `data:image/png;base64,${Buffer.from('saved-image').toString('base64')}` },
        { type: 'video', role: 'reference_video', source: 'https://cdn.example/input.mp4?signature=input' },
        { type: 'audio', role: 'reference_audio', source: 'data:audio/wav;base64,YQ==' },
      ], duration: 6, resolution: '720p', ratio: '16:9', options: { generate_audio: false, watermark: false, return_last_frame: true },
    })
    assert.equal(polls, 2)
    assert.ok(updates.some(update => update.providerJobId === 'public-task' && update.userCredentialId === 'credential-1'))
    assert.equal(Buffer.from(stored!.data).toString(), 'video-bytes')
    assert.equal(stored!.metadata.lastFrameUrl, 'https://cdn.example/last.jpg')
    assert.equal(stored!.metadata.options.referenceImages, undefined)
    assert.equal(stored!.metadata.options.referenceAudios, undefined)
    assert.ok(updates.every(update => !JSON.stringify(update).includes('base64,')))
    assert.deepEqual(stored!.metadata.upstreamUsage, { completion_tokens: 12345, seconds: 6 })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('Seedance 内容下载跳转保留签名且不转发 API 密钥', async t => {
  const fetched: Array<{ url: string; init?: RequestInit }> = []
  t.mock.method(globalThis, 'fetch', async (url: URL, init?: RequestInit) => {
    fetched.push({ url: String(url), init })
    return fetched.length === 1
      ? new Response(null, { status: 302, headers: { Location: 'https://cdn.example/result.mp4?signature=keep' } })
      : new Response('video', { headers: { 'Content-Type': 'video/mp4' } })
  })
  const verified: string[] = []
  const runner = new VideoGenerationRunner({} as never, {} as never,
    { buildRequestHeaders: () => ({ Authorization: 'Bearer test-key' }) } as never, {} as never,
    { assertPublicHttpUrl: async (url: string) => { verified.push(url); return new URL(url) } } as never, {} as never, {} as never)
  const internals = runner as unknown as { videoBytes: (url: string, provider: unknown) => Promise<{ bytes: Uint8Array }> }
  const result = await internals.videoBytes('https://onlycode.example/v1/videos/task-1/content', { type: 'NEW_API', baseUrl: 'https://onlycode.example/v1', timeoutMs: 1000, videoCapabilities: seedanceVideoCapabilities('seedance-2.0') })
  assert.equal(Buffer.from(result.bytes).toString(), 'video')
  assert.equal(new Headers(fetched[0].init?.headers).get('Authorization'), 'Bearer test-key')
  assert.equal(new Headers(fetched[1].init?.headers).get('Authorization'), null)
  assert.equal(fetched[1].url, 'https://cdn.example/result.mp4?signature=keep')
  assert.deepEqual(verified, ['https://cdn.example/result.mp4?signature=keep'])
})

test('Seedance 2.5 首尾帧和视频编辑的生产参数', () => {
  const caps = seedanceVideoCapabilities('Seedance-2.5')
  const image = { name: 'a.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==' }
  const frames = normalizeVideoOptions({ imageRole: 'first_last_frame', referenceImages: [image, image], aspectRatio: 'adaptive' }, caps)
  assert.equal(frames.imageRole, 'first_last_frame')
  const edit = normalizeVideoOptions({ videoTaskType: 'edit', referenceVideoUrls: ['https://cdn.example/source.mp4'], duration: -1, aspectRatio: 'adaptive', videoFormat: 'mov' }, caps)
  assert.equal(edit.videoFormat, 'mov')
  assert.throws(() => normalizeVideoOptions({ videoTaskType: 'edit', duration: 6 }, caps), /编辑和延长需要/)
})

test('失败任务或无法确定的创建结果不会转到其他渠道重建任务', async () => {
  const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as {
    withProviderFailover: (task: unknown, capability: string, execute: (provider: unknown) => Promise<unknown>) => Promise<unknown>
    provider: () => Promise<unknown>
    providerGet: () => Promise<unknown>
    updateRunningTask: () => Promise<void>
    assertNotCancelled: () => Promise<void>
    pollDelay: () => number
    canFailover: (error: unknown) => boolean
    videoResultUrl: (payload: unknown) => string
  }
  assert.equal(internals.canFailover(new TerminalProviderJobError('InvalidParameter', 502)), false)
  assert.equal(internals.canFailover(new ReconciliationRequiredError('submission_outcome_uncertain')), false)
  assert.equal(internals.videoResultUrl({ result: { url: 'https://cdn.example/result.mov' } }), 'https://cdn.example/result.mov')
  assert.equal(internals.videoResultUrl({ content: { video_url: 'https://cdn.example/result.mp4' } }), 'https://cdn.example/result.mp4')
  internals.withProviderFailover = async (_task, _capability, execute) => execute({ videoCapabilities: seedanceVideoCapabilities('seedance-2.0') })
  internals.provider = async () => ({ status: 'queued' })
  await assert.rejects(runner.run({ prompt: '生成视频', options: {} } as never), ReconciliationRequiredError)
  internals.provider = async () => ({ task_id: 'task-1' })
  internals.providerGet = async () => ({ status: 'failed', error: { code: 'InvalidParameter', message: 'original failure', param: 'content' }, metadata: { url: 'https://cdn.example/stale.mp4' } })
  internals.updateRunningTask = async () => undefined
  internals.assertNotCancelled = async () => undefined
  internals.pollDelay = () => 1
  await assert.rejects(runner.run({ prompt: '生成视频', options: {} } as never), error => error instanceof TerminalProviderJobError && error.message === 'original failure')
})
