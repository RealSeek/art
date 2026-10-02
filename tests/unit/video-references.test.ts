import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeVideoOptions, videoCapabilities } from '../../server/src/generations/video-options'
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
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAssetIds: ['asset'] }, h3Capabilities), /公开 HTTPS 地址/)
  assert.equal(normalizeVideoOptions({ duration: 5, imageRole: 'last_frame', referenceImageUrls: ['https://cdn.example/last.jpg'], aspectRatio: 'adaptive' }, h3Capabilities).imageRole, 'last_frame')
})

test('未声明参考能力的模型仍按单张参考图处理且拒绝音频', () => {
  const options = normalizeVideoOptions({ duration: 5, referenceAssetIds: ['image-0'] }, {})
  assert.deepEqual(options.referenceAssetIds, ['image-0'])
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAssetIds: ['a', 'b'] }, {}), /最多支持 1 张参考图/)
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAssetIds: ['a'], audioAssetIds: ['audio'] }, {}), /不支持参考音频/)
})

test('H3 模型自动导入时带上分辨率、时长区间与参考能力', () => {
  for (const id of ['MiniMax-H3', 'MiniMaxH3']) {
    const result = (ProvidersService.prototype as never as { discoveredModelOptions: (candidate: unknown, apiProtocol?: string) => { videoCapabilities: Record<string, unknown> } }).discoveredModelOptions({ id, capability: 'VIDEO', flatCreditCost: 2 }, 'openai')
    assert.deepEqual(result.videoCapabilities.resolutions, ['768p'])
    assert.equal(result.videoCapabilities.defaultResolution, '768p')
    assert.equal(result.videoCapabilities.maxReferences, 9)
    assert.equal(result.videoCapabilities.maxAudioReferences, 3)
    assert.equal(result.videoCapabilities.maxFirstLastFrames, 2)
    assert.equal(result.videoCapabilities.maxVideoReferences, 3)
    assert.equal(result.videoCapabilities.referenceMode, 'CONTENT_JSON')
    assert.equal(result.videoCapabilities.resolutionLocked, true)
    assert.deepEqual(result.videoCapabilities.durations, [1, 5, 10, 15])
    assert.equal((result.videoCapabilities.pricing as Record<string, number>)['768p:15'], 30)
  }
})

test('非 H3 视频模型保持旧的单张参考图行为', () => {
  const result = (ProvidersService.prototype as never as { discoveredModelOptions: (candidate: unknown, apiProtocol?: string) => { videoCapabilities: Record<string, unknown> } }).discoveredModelOptions({ id: 'sora-2', capability: 'VIDEO', flatCreditCost: 3 }, 'openai')
  assert.equal(result.videoCapabilities.maxReferences, undefined)
  assert.equal(result.videoCapabilities.maxAudioReferences, undefined)
})
