import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'
import { newApiNativeVideoCapabilities, normalizeVideoOptions, seedanceVideoCapabilities, videoCapabilities, videoProviderUrl } from '../../server/src/generations/video-options'
import { ProvidersService, type ResolvedProvider } from '../../server/src/providers/providers.service'
import { ReconciliationRequiredError, TerminalProviderJobError } from '../../server/src/generations/generation-provider-errors'

test('multipart 视频请求由传输层设置 Content-Type 和 boundary，而不是 JSON', async () => {
  const headers = ProvidersService.prototype as unknown as { buildRequestHeaders: (provider: unknown, protocol: string, contentType: string | null) => Record<string, string> }
  const providers = {
    applyAuth: () => undefined,
    buildRequestHeaders: headers.buildRequestHeaders,
  }
  assert.equal(providers.buildRequestHeaders({ headers: {} }, 'openai', 'application/json')['Content-Type'], 'application/json')
  const runner = new VideoGenerationRunner({} as never, {} as never, providers as never, {} as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as {
    providerForm: (provider: unknown, path: string, form: FormData) => Promise<unknown>
    providerFetch: (provider: unknown, url: string, init: RequestInit) => Promise<Response>
  }
  internals.providerFetch = async (_provider, url, init) => {
    const request = new Request(url, init)
    assert.match(request.headers.get('Content-Type')!, /^multipart\/form-data; boundary=/)
    const form = await request.formData()
    assert.equal(form.get('model'), 'test-video')
    assert.equal((form.get('input_reference') as File).name, 'image.png')
    return Response.json({ id: 'test-task' })
  }
  const form = new FormData()
  form.append('model', 'test-video')
  form.append('input_reference', new Blob(['image'], { type: 'image/png' }), 'image.png')
  await internals.providerForm({ apiKey: 'test-key', headers: { 'Content-Type': 'application/json', 'content-type': 'application/json' }, baseUrl: 'https://api.example/v1', timeoutMs: 1000 }, '/videos', form)
})

test('Seedance 2.0 / 2.5 自动导入官方请求格式和版本能力上限', () => {
  const discover = ProvidersService.prototype as unknown as { discoveredModelOptions: (model: unknown) => { videoCapabilities: Record<string, unknown> } }
  for (const [id, maxDuration, imageLimit, audioLimit] of [['[c]Seedance-2.0-fast', 15, 9, 3], ['doubao-seedance-2-5-260628', 30, 30, 10]] as const) {
    const raw = discover.discoveredModelOptions({ id, capability: 'VIDEO', flatCreditCost: 1 }).videoCapabilities
    const caps = videoCapabilities(raw)
    assert.equal(caps.requestFormat, 'seedance')
    assert.equal(caps.referenceMode, 'CONTENT_JSON')
    assert.equal(caps.maxDuration, maxDuration)
    assert.equal(caps.maxReferences, imageLimit)
    assert.equal(caps.maxAudioReferences, audioLimit)
    assert.equal(caps.maxFirstLastFrames, 2)
    assert.equal(normalizeVideoOptions({ duration: -1, aspectRatio: 'adaptive' }, caps).duration, -1)
    assert.equal(normalizeVideoOptions({ duration: maxDuration }, caps).duration, maxDuration)
  }
  assert.equal(normalizeVideoOptions({ resolution: '4k' }, seedanceVideoCapabilities('seedance-2.0')).resolution, '4k')
  assert.deepEqual(seedanceVideoCapabilities('seedance-2.5').durations, Array.from({ length: 27 }, (_, index) => index + 4))
  assert.equal(normalizeVideoOptions({ duration: 4 }, seedanceVideoCapabilities('seedance-2.5')).duration, 4)
  assert.equal(normalizeVideoOptions({ duration: 29 }, seedanceVideoCapabilities('seedance-2.5')).duration, 29)
  const fullFrames = normalizeVideoOptions({ imageRole: 'first_last_frame', referenceImageUrls: ['https://cdn.example/start.png', 'https://cdn.example/end.png'] }, seedanceVideoCapabilities('seedance-2.0'))
  assert.equal(fullFrames.imageRole, 'first_last_frame')
  assert.throws(() => normalizeVideoOptions({ resolution: '4k' }, seedanceVideoCapabilities('seedance-2.5')), /不支持该分辨率/)
  assert.throws(() => normalizeVideoOptions({ duration: 3 }, seedanceVideoCapabilities('seedance-2.0')), /between 4 and 15/)
  assert.throws(() => normalizeVideoOptions({ duration: 31 }, seedanceVideoCapabilities('seedance-2.5')), /between 4 and 30/)
})

test('特惠 Seedance 2.0 / 2.5 只接受 720p，默认参数同样使用 720p', () => {
  const discover = ProvidersService.prototype as unknown as { discoveredModelOptions: (model: unknown) => { videoCapabilities: Record<string, unknown> } }
  for (const id of ['[c]seedance-2.0', '[C]Seedance 2.5', '[c]Seedance-2.5']) {
    const caps = videoCapabilities(discover.discoveredModelOptions({ id, capability: 'VIDEO' }).videoCapabilities)
    assert.deepEqual(caps.resolutions, ['720p'])
    assert.equal(caps.defaultResolution, '720p')
    assert.equal(normalizeVideoOptions({}, caps).resolution, '720p')
    assert.equal(normalizeVideoOptions({ resolution: '720p' }, caps).resolution, '720p')
    for (const resolution of ['480p', '1080p', '4k']) {
      assert.throws(() => normalizeVideoOptions({ resolution }, caps), /不支持该分辨率/)
    }
  }
})

test('[C]Seedance 2.5 渠道别名只接受固定 30 秒，不支持自动时长', () => {
  const discover = ProvidersService.prototype as unknown as { discoveredModelOptions: (model: unknown) => { videoCapabilities: Record<string, unknown> } }
  for (const id of ['[C]Seedance 2.5', '[c]Seedance-2.5']) {
    const caps = videoCapabilities(discover.discoveredModelOptions({ id, capability: 'VIDEO' }).videoCapabilities)
    assert.deepEqual(caps.durations, [30])
    assert.equal(caps.defaultDuration, 30)
    assert.equal(caps.minDuration, 30)
    assert.equal(caps.maxDuration, 30)
    assert.equal(caps.supportsAutoDuration, false)
    assert.equal(normalizeVideoOptions({}, caps).duration, 30)
    assert.equal(normalizeVideoOptions({ duration: 30 }, caps).duration, 30)
    for (const duration of [-1, 5, 15, 29, 31]) {
      assert.throws(() => normalizeVideoOptions({ duration }, caps), /between 30 and 30/)
    }
  }
})

test('DMC MiniMax H3 使用 768P 请求格式并接受待临时托管的本地媒体', () => {
  const discover = ProvidersService.prototype as unknown as { discoveredModelOptions: (model: unknown) => { videoCapabilities: Record<string, unknown> } }
  const caps = videoCapabilities(discover.discoveredModelOptions({ id: 'MiniMax-H3', capability: 'VIDEO' }).videoCapabilities)
  assert.equal(caps.requestFormat, 'minimax-h3')
  assert.equal(caps.referenceMode, 'CONTENT_JSON')
  assert.deepEqual(caps.durations, Array.from({ length: 15 }, (_, index) => index + 1))
  assert.equal(caps.maxReferences, 9)
  assert.equal(caps.maxVideoReferences, 3)
  assert.equal(caps.maxAudioReferences, 3)
  assert.equal(caps.maxTotalReferences, 12)
  assert.equal(normalizeVideoOptions({ duration: 7 }, caps).duration, 7)
  assert.equal(normalizeVideoOptions({ referenceImages: [{ name: 'image.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==' }] }, caps).referenceImages.length, 1)
})

test('Seedance 发送官方 content[] 请求及稳定幂等键', async () => {
  const sent: Array<{ body: Record<string, unknown>; key?: string }> = []
  const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as {
    withProviderFailover: (task: unknown, capability: string, execute: (provider: unknown) => Promise<unknown>) => Promise<unknown>
    provider: (provider: unknown, path: string, body: Record<string, unknown>, timeout: number, key: string) => Promise<unknown>
  }
  internals.withProviderFailover = async (_task, _capability, execute) => execute({ model: 'doubao-seedance-2-5-260628', timeoutMs: 1000, videoCapabilities: seedanceVideoCapabilities('doubao-seedance-2-5-260628') })
  internals.provider = async (_provider, _path, body, _timeout, key) => { sent.push({ body, key }); return { status: 'failed', error: { message: 'test stopped after submission' } } }
  const task = { id: 'seedance-job', prompt: '根据 @参考图0 生成视频', options: { referenceImages: [{ name: 'a.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==' }], generateAudio: true, watermark: false, returnLastFrame: true } }
  for (let i = 0; i < 2; i++) await assert.rejects(runner.run(task as never), /test stopped after submission/)
  assert.equal(sent[0].key, 'art-video-seedance-job')
  assert.deepEqual(sent[0], sent[1])
  assert.equal(sent[0].body.duration, 5)
  assert.deepEqual(sent[0].body.content, [
    { type: 'text', text: '根据 @参考图0 生成视频' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' }, role: 'reference_image' },
  ])
  assert.equal(sent[0].body.ratio, '16:9')
  assert.equal(sent[0].body.generate_audio, true)
  assert.equal(sent[0].body.watermark, false)
  assert.equal(sent[0].body.return_last_frame, true)
  assert.equal(sent[0].body.references, undefined)
})

test('DMC MiniMax H3 使用 768P content[] body，不携带 Seedance 参数', async () => {
  let sent: Record<string, unknown> | undefined
  const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as {
    withProviderFailover: (task: unknown, capability: string, execute: (provider: unknown) => Promise<unknown>) => Promise<unknown>
    provider: (provider: unknown, path: string, body: Record<string, unknown>) => Promise<unknown>
  }
  const capabilities = { requestFormat: 'minimax-h3', referenceMode: 'CONTENT_JSON', resolutions: ['768p'], durations: [5], aspectRatios: ['16:9'], defaultResolution: '768p', defaultDuration: 5, defaultAspectRatio: '16:9', minDuration: 1, maxDuration: 15, maxReferences: 9, maxAudioReferences: 3, maxVideoReferences: 3, maxFirstLastFrames: 2, maxTotalReferences: 12, resolutionLocked: true, requiresPublicReferenceUrls: true }
  internals.withProviderFailover = async (_task, _capability, execute) => execute({ model: 'MiniMax-H3', timeoutMs: 1000, videoCapabilities: capabilities })
  internals.provider = async (_provider, path, body) => { assert.equal(path, '/videos'); sent = body; return { status: 'failed', error: { message: 'test stopped after submission' } } }
  await assert.rejects(runner.run({ id: 'minimax-job', prompt: 'a wave', options: { duration: 5, referenceImageUrls: ['https://cdn.example/image.png'] } } as never), /test stopped after submission/)
  assert.deepEqual(sent, {
    model: 'MiniMax-H3', content: [
      { type: 'text', text: 'a wave' },
      { type: 'image_url', image_url: { url: 'https://cdn.example/image.png' }, role: 'reference_image' },
    ], duration: 5, resolution: '768P', ratio: '16:9',
  })
})

test('MiniMax H3 将本地图片和音频临时托管，保留公开 URL 和首帧角色', async () => {
  const hosted: Array<{ slot: string; source: string }> = []
  let sent: Record<string, any> | undefined
  const runner = new VideoGenerationRunner({} as never, {
    publishVideoReference: async (job: { id: string }, slot: string, source: string) => {
      assert.equal(job.id, 'temporary-job')
      hosted.push({ slot, source })
      return `https://art.example/v1/assets/video-references/${slot}`
    },
  } as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as {
    withProviderFailover: (task: unknown, capability: string, execute: (provider: unknown) => Promise<unknown>) => Promise<unknown>
    provider: (provider: unknown, path: string, body: Record<string, unknown>) => Promise<unknown>
  }
  const caps = { requestFormat: 'minimax-h3', referenceMode: 'CONTENT_JSON', resolutions: ['768p'], maxReferences: 9, maxAudioReferences: 3, maxVideoReferences: 3, maxFirstLastFrames: 2, requiresPublicReferenceUrls: true }
  internals.withProviderFailover = async (_task, _capability, execute) => execute({ model: 'MiniMax-H3', timeoutMs: 1000, videoCapabilities: caps })
  internals.provider = async (_provider, _path, body) => { sent = body; return { status: 'failed', error: { message: 'stop after submit' } } }
  const reference = { name: 'a.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==' }
  const audio = { name: 'a.mp3', mimeType: 'audio/mpeg', dataUrl: 'data:audio/mpeg;base64,Yg==' }
  const video = { name: 'a.mp4', mimeType: 'video/mp4', dataUrl: 'data:video/mp4;base64,Yw==' }
  await assert.rejects(runner.run({ id: 'temporary-job', prompt: '@参考图1 模仿 @参考视频0，音色来自 @参考音频0，背景使用 @参考图0；保留不存在的 @参考图2 与 @参考音频1', options: { referenceImages: [reference], referenceAudios: [audio], referenceVideos: [video], referenceImageUrls: ['https://cdn.example/a.png'] } } as never), /stop after submit/)
  assert.equal(sent!.content[0].text, '<Picture 2> 模仿 <Video 1>，音色来自 <Audio 1>，背景使用 <Picture 1>；保留不存在的 @参考图2 与 @参考音频1')
  assert.deepEqual(hosted, [{ slot: 'image-1', source: reference.dataUrl }, { slot: 'audio-0', source: audio.dataUrl }, { slot: 'video-0', source: video.dataUrl }])
  assert.deepEqual(sent!.content.map((item: Record<string, any>) => item.image_url?.url || item.video_url?.url || item.audio_url?.url).filter(Boolean), [
    'https://cdn.example/a.png', 'https://art.example/v1/assets/video-references/image-1', 'https://art.example/v1/assets/video-references/video-0', 'https://art.example/v1/assets/video-references/audio-0',
  ])
  await assert.rejects(runner.run({ id: 'temporary-job', prompt: 'move', options: { referenceImages: [reference], imageRole: 'first_frame' } } as never), /stop after submit/)
  assert.equal(sent!.content[1].role, 'first_frame')
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
      referenceVideoUrls: ['https://cdn.example/input.mp4?signature=input'], generateAudio: false, watermark: false,
    } } as never)
    assert.deepEqual(created, {
      model: 'Seedance-2.0', content: [
        { type: 'text', text: '保持主体外观' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,bG9jYWw=' }, role: 'reference_image' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('saved-image').toString('base64')}` }, role: 'reference_image' },
        { type: 'video_url', video_url: { url: 'https://cdn.example/input.mp4?signature=input' }, role: 'reference_video' },
        { type: 'audio_url', audio_url: { url: 'data:audio/wav;base64,YQ==' }, role: 'reference_audio' },
      ], duration: 6, resolution: '720p', ratio: '16:9', generate_audio: false, watermark: false,
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
  for (const imageRole of ['first_frame', 'first_last_frame'] as const) {
    const referenceImages = imageRole === 'first_frame' ? [image] : [image, image]
    assert.throws(() => normalizeVideoOptions({ imageRole, referenceImages, aspectRatio: '16:9' }, caps), /需要 adaptive 比例/)
  }
  const edit = normalizeVideoOptions({ videoTaskType: 'edit', referenceVideoUrls: ['https://cdn.example/source.mp4'], duration: -1, aspectRatio: 'adaptive', videoFormat: 'mov' }, caps)
  assert.equal(edit.videoFormat, 'mov')
  assert.throws(() => normalizeVideoOptions({ videoTaskType: 'edit', duration: 6 }, caps), /编辑和延长需要/)
  for (const videoTaskType of ['edit', 'extend'] as const) {
    const options = { videoTaskType, referenceVideoUrls: ['https://cdn.example/source.mp4'], duration: videoTaskType === 'edit' ? -1 : 6 }
    assert.throws(() => normalizeVideoOptions({ ...options, aspectRatio: '16:9' }, caps), /编辑和延长需要/)
    assert.equal(normalizeVideoOptions({ ...options, aspectRatio: 'adaptive' }, caps).videoTaskType, videoTaskType)
  }
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


test('NewAPI 原生入口按火山、Wan、MiniMax、可灵分别创建、查询和保存结果', async () => {
  const cases = [
    { model: 'seedance-2.0', path: '/doubao/api/v3/contents/generations/tasks', query: '/doubao/api/v3/contents/generations/tasks/public-task', options: { duration: 6 },
      body: { model: 'seedance-2.0', content: [{ type: 'text', text: 'test video' }], duration: 6, resolution: '720p', ratio: '16:9' },
      created: { id: 'public-task' }, completed: { status: 'succeeded', content: { video_url: '/result.mp4' } } },
    { model: 'wan2.6-t2v', path: '/ali/api/v1/services/aigc/video-generation/video-synthesis', query: '/ali/api/v1/tasks/public-task', options: { duration: 6, resolution: '720p' },
      body: { model: 'wan2.6-t2v', input: { prompt: 'test video' }, parameters: { duration: 6, size: '1280*720' } },
      created: { request_id: 'request-is-not-a-task', output: { task_id: 'public-task', task_status: 'PENDING' } },
      completed: { output: { task_id: 'public-task', task_status: 'SUCCEEDED', video_url: '/result.mp4' } } },
    { model: 'wan2.7-i2v', path: '/ali/api/v1/services/aigc/video-generation/video-synthesis', query: '/ali/api/v1/tasks/public-task', options: { duration: 6, imageRole: 'first_frame', referenceImageUrls: ['https://cdn.example/start.png'] },
      body: { model: 'wan2.7-i2v', input: { prompt: 'test video', media: [{ type: 'first_frame', url: 'https://cdn.example/start.png' }] }, parameters: { duration: 6, resolution: '1080P' } },
      created: { output: { task_id: 'public-task', task_status: 'PENDING' } }, completed: { output: { task_status: 'SUCCEEDED', video_url: '/result.mp4' } } },
    { model: 'MiniMax-H3', path: '/hailuo/v2/video_generation', query: '/hailuo/v2/query/video_generation/public-task', options: { duration: 7 },
      body: { model: 'MiniMax-H3', content: [{ type: 'text', text: 'test video' }], duration: 7, resolution: '768P', ratio: '16:9' },
      created: { task_id: 'public-task' }, completed: { task: { id: 'public-task', status: 'succeeded', content: { url: '/result.mp4' } } } },
    { model: 'kling-v1-6', path: '/kling/v1/videos/image2video', query: '/kling/v1/videos/image2video/public-task', options: { duration: 5, referenceImageUrls: ['https://cdn.example/start.png'] },
      body: { model_name: 'kling-v1-6', prompt: 'test video', duration: '5', aspect_ratio: '16:9', mode: 'std', image: 'https://cdn.example/start.png' },
      created: { code: 0, data: { task_id: 'public-task', task_status: 'submitted' } }, completed: { data: { task_status: 'succeed', task_result: { videos: [{ url: '/result.mp4' }] } } } },
  ]
  for (const row of cases) {
    let posts = 0
    let polls = 0
    let stored = false
    const updates: Array<Record<string, unknown>> = []
    const server = createServer(async (request, response) => {
      assert.equal(request.headers.authorization, request.url === '/result.mp4' ? undefined : 'Bearer test-key')
      if (request.method === 'POST') {
        posts += 1
        assert.equal(request.url, row.path)
        assert.equal(request.headers['idempotency-key'], 'art-video-native-job')
        if (row.model.startsWith('wan')) assert.equal(request.headers['x-dashscope-async'], 'enable')
        let raw = ''
        for await (const chunk of request) raw += chunk
        assert.deepEqual(JSON.parse(raw), row.body)
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(row.created))
      } else if (request.url === '/result.mp4') response.writeHead(200, { 'Content-Type': 'video/mp4' }).end('video-bytes')
      else {
        assert.equal(request.url, row.query)
        polls += 1
        if (polls === 1) { response.writeHead(503).end('temporary query failure'); return }
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(row.completed))
      }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
      const resolved = { source: 'user', credentialId: 'credential', routeId: 'route', type: 'LOCAL_WORKER', baseUrl, apiKey: 'test-key', model: row.model, timeoutMs: 1000, videoCostMicros: 0, pricingUsdExchangeRateMicros: 1_000_000, videoCapabilities: newApiNativeVideoCapabilities(row.model) } as unknown as ResolvedProvider
      const runner = new VideoGenerationRunner(
        { generationJob: { findUnique: async () => ({ status: 'RUNNING' }), updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 } } } } as never,
        {} as never,
        { resolveCandidates: async () => [resolved], buildRequestHeaders: () => ({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' }), recordCandidateResult: async () => {} } as never,
        { cleanup: async () => {}, storeAndLink: async (_task: unknown, output: { data: Uint8Array }) => { assert.equal(Buffer.from(output.data).toString(), 'video-bytes'); stored = true; return { id: 'asset' } } } as never,
        {} as never, { start: async () => ({ id: 'attempt' }), succeed: async () => {} } as never, { settleNonChat: async () => {} } as never,
      )
      ;(runner as unknown as { pollDelay: () => number }).pollDelay = () => 1
      await runner.run({ id: 'native-job', userId: 'user', prompt: 'test video', options: row.options } as never)
      assert.equal(posts, 1, row.model)
      assert.equal(polls, 2, row.model)
      assert.ok(updates.some((update) => update.providerJobId === 'public-task'), row.model)
      assert.ok(stored, row.model)
      const persisted = updates.find((update) => update.providerJobId === 'public-task')?.options as { videoPaths: { statusPath: string } }
      assert.ok(persisted.videoPaths.statusPath.includes('{id}'))
      await runner.run({ id: 'native-job', userId: 'user', prompt: 'test video', options: { ...row.options, ...persisted }, providerJobId: 'public-task', userCredentialId: 'credential' } as never)
      assert.equal(posts, 1, '恢复已有任务不得重新创建')
    } finally { server.close(); await once(server, 'close') }
  }
  assert.equal(videoProviderUrl('https://example.test/proxy/v1', '/ali/api/v1/tasks/task'), 'https://example.test/proxy/ali/api/v1/tasks/task')
})


test('协议切换后的已有 NewAPI 付费任务继续查询旧任务入口', async () => {
  const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => {} } as never, {} as never, {} as never, {} as never)
  const internal = runner as any
  const resolved = { type: 'NEW_API', credentialId: 'credential', model: 'seedance-2.0', timeoutMs: 1000, videoCapabilities: newApiNativeVideoCapabilities('seedance-2.0') }
  internal.withProviderFailover = async (_task: unknown, _kind: unknown, execute: (provider: unknown) => Promise<unknown>) => execute(resolved)
  internal.provider = async () => { throw new Error('不得重新创建旧任务') }
  internal.assertNotCancelled = async () => {}
  internal.pollDelay = () => 1
  internal.providerGet = async (_provider: unknown, path: string) => {
    assert.equal(path, '/videos/old-public-task')
    throw new ReconciliationRequiredError('旧任务已核对')
  }
  await assert.rejects(runner.run({ id: 'old-job', userCredentialId: 'credential', providerJobId: 'old-public-task', prompt: 'p', options: {} } as never), /旧任务已核对/)
})
