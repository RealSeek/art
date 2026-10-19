import assert from 'node:assert/strict'
import test from 'node:test'
import { newApiNativeVideoCapabilities, normalizeVideoOptions, videoCapabilities, wanVideoRequest } from '../../server/src/generations/video-options'
import { ProvidersService } from '../../server/src/providers/providers.service'

const h3Capabilities = {
  videoCapabilities: {
    resolutions: ['768p'],
    durations: [1, 5, 10, 15],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    defaultResolution: '768p',
    defaultDuration: 5,
    defaultAspectRatio: '16:9',
    maxReferences: 9,
    maxFirstLastFrames: 2,
    maxVideoReferences: 3,
    maxAudioReferences: 3,
    maxTotalReferences: 12,
    referenceMode: 'CONTENT_JSON',
    minDuration: 1,
    maxDuration: 15,
    resolutionLocked: true,
    requiresPublicReferenceUrls: true,
    audioRequiresVisualReference: false,
  },
}

test('H3 能力声明解析为参考图 9 张 / 首尾帧 2 张 / 视频音频各 3 段 / 1–15 秒', () => {
  const capabilities = videoCapabilities(h3Capabilities)
  assert.equal(capabilities.maxReferences, 9)
  assert.equal(capabilities.maxAudioReferences, 3)
  assert.equal(capabilities.maxFirstLastFrames, 2)
  assert.equal(capabilities.maxVideoReferences, 3)
  assert.equal(capabilities.referenceMode, 'CONTENT_JSON')
  assert.equal(capabilities.minDuration, 1)
  assert.equal(capabilities.maxDuration, 15)
  assert.equal(capabilities.resolutionLocked, true)
})

test('H3 公开 HTTPS 参考素材按模型上限校验，音频可单独使用', () => {
  const images = Array.from({ length: 9 }, (_, index) => `https://cdn.example/image-${index}.jpg`)
  const audios = ['https://cdn.example/audio-0.mp3', 'https://cdn.example/audio-1.mp3', 'https://cdn.example/audio-2.mp3']
  const accepted = normalizeVideoOptions({ duration: 10, referenceImageUrls: images, referenceAudioUrls: audios }, h3Capabilities)
  assert.equal(accepted.referenceImageUrls.length, 9)
  assert.equal(accepted.referenceAudioUrls.length, 3)

  assert.throws(() => normalizeVideoOptions({ duration: 10, referenceImageUrls: [...images, 'https://cdn.example/image-9.jpg'] }, h3Capabilities), /最多支持 9 张参考图/)
  assert.throws(() => normalizeVideoOptions({ duration: 10, referenceImageUrls: images, referenceAudioUrls: [...audios, 'https://cdn.example/audio-3.mp3'] }, h3Capabilities), /最多支持 3 段参考音频/)
  assert.equal(normalizeVideoOptions({ duration: 1, referenceAudioUrls: audios }, h3Capabilities).duration, 1)
  assert.throws(() => normalizeVideoOptions({ duration: 16 }, h3Capabilities), /1 and 15/)
  assert.deepEqual(normalizeVideoOptions({ duration: 5, referenceAssetIds: ['asset'] }, h3Capabilities).referenceAssetIds, ['asset'])
  assert.equal(normalizeVideoOptions({ duration: 5, imageRole: 'last_frame', referenceImageUrls: ['https://cdn.example/last.jpg'], aspectRatio: 'adaptive' }, h3Capabilities).imageRole, 'last_frame')
})

test('H3 内联参考视频计入视频上限和总素材上限', () => {
  const video = { name: 'reference.mp4', mimeType: 'video/mp4', dataUrl: 'data:video/mp4;base64,YQ==' }
  const accepted = normalizeVideoOptions({ duration: 5, referenceVideos: [video] }, h3Capabilities)
  assert.equal(accepted.referenceVideos.length, 1)
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceVideoUrls: ['https://cdn.example/a.mp4', 'https://cdn.example/b.mp4', 'https://cdn.example/c.mp4'], referenceVideos: [video] }, h3Capabilities), /最多支持 3 段参考视频/)
})

test('未声明参考能力的模型仍按单张参考图处理且拒绝音频', () => {
  const options = normalizeVideoOptions({ duration: 5, referenceAssetIds: ['image-0'] }, {})
  assert.deepEqual(options.referenceAssetIds, ['image-0'])
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAssetIds: ['a', 'b'] }, {}), /最多支持 1 张参考图/)
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAssetIds: ['a'], audioAssetIds: ['audio'] }, {}), /不支持参考音频/)
})

test('H3 模型自动导入时带上分辨率、时长区间与参考能力', () => {
  for (const id of ['MiniMax-H3']) {
    const result = (ProvidersService.prototype as never as { discoveredModelOptions: (candidate: unknown, apiProtocol?: string) => { videoCapabilities: Record<string, unknown> } }).discoveredModelOptions({ id, capability: 'VIDEO', flatCreditCost: 2 }, 'openai')
    assert.deepEqual(result.videoCapabilities.resolutions, ['768p'])
    assert.equal(result.videoCapabilities.defaultResolution, '768p')
    assert.equal(result.videoCapabilities.maxReferences, 9)
    assert.equal(result.videoCapabilities.maxAudioReferences, 3)
    assert.equal(result.videoCapabilities.maxFirstLastFrames, 2)
    assert.equal(result.videoCapabilities.maxVideoReferences, 3)
    assert.equal(result.videoCapabilities.referenceMode, 'CONTENT_JSON')
    assert.equal(result.videoCapabilities.resolutionLocked, true)
    assert.deepEqual(result.videoCapabilities.durations, Array.from({ length: 15 }, (_, index) => index + 1))
    assert.equal((result.videoCapabilities.pricing as Record<string, number>)['768p:15'], 30)
  }
})

test('MiniMaxH3 网关别名开放四档画质，变体保留各自档位而非满血版 768p', () => {
  const discover = ProvidersService.prototype as unknown as { discoveredModelOptions: (candidate: unknown) => { videoCapabilities: Record<string, unknown> }; normalizeVideoCapabilities: (value: Record<string, unknown>) => { resolutions: string[] } }
  for (const prefix of ['', '[c]']) {
    const caps = discover.discoveredModelOptions({ id: `${prefix}MiniMaxH3`, capability: 'VIDEO', flatCreditCost: 2 }).videoCapabilities
    assert.deepEqual(caps.resolutions, ['480p', '720p', '2k', '2k-pro'])
    assert.equal(caps.defaultResolution, '720p')
    assert.equal(caps.resolutionLocked, false)
    assert.equal(caps.requestFormat, null)
    assert.equal(caps.requiresPublicReferenceUrls, false)
    assert.deepEqual(discover.normalizeVideoCapabilities(caps).resolutions, caps.resolutions)
    for (const resolution of ['480p', '720p', '2k', '2k-pro']) {
      assert.equal(normalizeVideoOptions({ resolution }, caps).resolution, resolution)
      const variant = discover.discoveredModelOptions({ id: `${prefix}MiniMaxH3-${resolution}`, capability: 'VIDEO' }).videoCapabilities
      assert.deepEqual(variant.resolutions, [resolution])
      assert.equal(variant.resolutionLocked, true)
    }
    assert.throws(() => normalizeVideoOptions({ resolution: '768p' }, caps), /不支持该分辨率/)
  }
})

test('非 H3 视频模型保持旧的单张参考图行为', () => {
  const result = (ProvidersService.prototype as never as { discoveredModelOptions: (candidate: unknown, apiProtocol?: string) => { videoCapabilities: Record<string, unknown> } }).discoveredModelOptions({ id: 'sora-2', capability: 'VIDEO', flatCreditCost: 3 }, 'openai')
  assert.equal(result.videoCapabilities.maxReferences, undefined)
  assert.equal(result.videoCapabilities.maxAudioReferences, undefined)
})


test('Wan 原生参数按版本传 size、resolution 和 media，拒绝不支持的时长与素材', () => {
  assert.equal(newApiNativeVideoCapabilities('[c]seedance-2.5'), undefined)
  const legacy = newApiNativeVideoCapabilities('wan2.5-t2v-preview')!
  assert.throws(() => normalizeVideoOptions({ duration: 7 }, legacy), /不支持该时长/)
  const options = normalizeVideoOptions({ duration: 5, resolution: '480p', aspectRatio: '1:1', watermark: false }, legacy)
  assert.deepEqual(wanVideoRequest('wan2.5-t2v-preview', 'p', options, [], [], []), { model: 'wan2.5-t2v-preview', input: { prompt: 'p' }, parameters: { duration: 5, size: '624*624', watermark: false } })
  const all = newApiNativeVideoCapabilities('wan3.0-video')!
  const references = normalizeVideoOptions({ duration: -1, referenceImageUrls: ['https://cdn.example/image.png'], referenceVideoUrls: ['https://cdn.example/video.mp4'], referenceAudioUrls: ['https://cdn.example/audio.mp3'] }, all)
  assert.deepEqual(wanVideoRequest('wan3.0-video', 'p', references, references.referenceImageUrls, references.referenceVideoUrls, references.referenceAudioUrls), {
    model: 'wan3.0-video', input: { prompt: 'p', media: [{ type: 'reference_image', url: 'https://cdn.example/image.png' }, { type: 'reference_video', url: 'https://cdn.example/video.mp4' }, { type: 'reference_audio', url: 'https://cdn.example/audio.mp3' }] }, parameters: { duration: -1, resolution: '1080P', ratio: '16:9' },
  })
  const frames = normalizeVideoOptions({ referenceImageUrls: ['https://cdn.example/start.png', 'https://cdn.example/end.png'] }, newApiNativeVideoCapabilities('wan2.2-kf2v-flash'))
  assert.deepEqual(wanVideoRequest('wan2.2-kf2v-flash', 'p', frames, frames.referenceImageUrls, [], []).input, { prompt: 'p', first_frame_url: 'https://cdn.example/start.png', last_frame_url: 'https://cdn.example/end.png' })
  assert.throws(() => wanVideoRequest('wan2.6-i2v', 'p', normalizeVideoOptions({}, newApiNativeVideoCapabilities('wan2.6-i2v')), [], [], []), /需要一张参考图/)
})
