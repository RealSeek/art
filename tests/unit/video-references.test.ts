import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeVideoOptions, videoCapabilities } from '../../server/src/generations/video-options'
import { ProvidersService } from '../../server/src/providers/providers.service'

const h3Capabilities = {
  videoCapabilities: {
    resolutions: ['2k'],
    durations: [5, 10, 15],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    defaultResolution: '2k',
    defaultDuration: 5,
    defaultAspectRatio: '16:9',
    maxReferences: 9,
    maxAudioReferences: 3,
    referenceMode: 'DATA_URL_JSON',
    minDuration: 5,
    maxDuration: 15,
    resolutionLocked: true,
  },
}

test('H3 能力声明解析为参考图 9 张 / 参考音频 3 段 / 5–15 秒', () => {
  const capabilities = videoCapabilities(h3Capabilities)
  assert.equal(capabilities.maxReferences, 9)
  assert.equal(capabilities.maxAudioReferences, 3)
  assert.equal(capabilities.referenceMode, 'DATA_URL_JSON')
  assert.equal(capabilities.minDuration, 5)
  assert.equal(capabilities.maxDuration, 15)
  assert.equal(capabilities.resolutionLocked, true)
})

test('参考图与音频按模型上限校验，音频必须搭配图片', () => {
  const images = Array.from({ length: 9 }, (_, index) => `image-${index}`)
  const audios = ['audio-0', 'audio-1', 'audio-2']
  const accepted = normalizeVideoOptions({ duration: 10, referenceAssetIds: images, audioAssetIds: audios }, h3Capabilities)
  assert.equal(accepted.referenceAssetIds.length, 9)
  assert.equal(accepted.audioAssetIds.length, 3)

  assert.throws(() => normalizeVideoOptions({ duration: 10, referenceAssetIds: [...images, 'image-9'] }, h3Capabilities), /最多支持 9 张参考图/)
  assert.throws(() => normalizeVideoOptions({ duration: 10, referenceAssetIds: images, audioAssetIds: [...audios, 'audio-3'] }, h3Capabilities), /最多支持 3 段参考音频/)
  assert.throws(() => normalizeVideoOptions({ duration: 10, audioAssetIds: audios }, h3Capabilities), /参考音频必须搭配至少一张参考图/)
  assert.throws(() => normalizeVideoOptions({ duration: 4 }, h3Capabilities), /5 and 15/)
  assert.throws(() => normalizeVideoOptions({ duration: 16 }, h3Capabilities), /5 and 15/)
})

test('未声明参考能力的模型仍按单张参考图处理且拒绝音频', () => {
  const options = normalizeVideoOptions({ duration: 5, referenceAssetIds: ['image-0'] }, {})
  assert.deepEqual(options.referenceAssetIds, ['image-0'])
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAssetIds: ['a', 'b'] }, {}), /最多支持 1 张参考图/)
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAssetIds: ['a'], audioAssetIds: ['audio'] }, {}), /不支持参考音频/)
})

test('H3 模型自动导入时带上分辨率、时长区间与参考能力', () => {
  for (const [id, resolution] of [['MiniMaxH3-480p', '480p'], ['MiniMaxH3-2k-pro', '2k'], ['MiniMaxH3-2k-pro-sec-nf', '2k']] as const) {
    const result = (ProvidersService.prototype as never as { discoveredModelOptions: (candidate: unknown, apiProtocol?: string) => { videoCapabilities: Record<string, unknown> } }).discoveredModelOptions({ id, capability: 'VIDEO', flatCreditCost: 2 }, 'openai')
    assert.deepEqual(result.videoCapabilities.resolutions, [resolution])
    assert.equal(result.videoCapabilities.defaultResolution, resolution)
    assert.equal(result.videoCapabilities.maxReferences, 9)
    assert.equal(result.videoCapabilities.maxAudioReferences, 3)
    assert.equal(result.videoCapabilities.referenceMode, 'DATA_URL_JSON')
    assert.equal(result.videoCapabilities.resolutionLocked, true)
    assert.deepEqual(result.videoCapabilities.durations, [5, 10, 15])
    assert.equal((result.videoCapabilities.pricing as Record<string, number>)[`${resolution}:15`], 30)
  }
})

test('非 H3 视频模型保持旧的单张参考图行为', () => {
  const result = (ProvidersService.prototype as never as { discoveredModelOptions: (candidate: unknown, apiProtocol?: string) => { videoCapabilities: Record<string, unknown> } }).discoveredModelOptions({ id: 'seedance-2.0', capability: 'VIDEO', flatCreditCost: 3 }, 'openai')
  assert.equal(result.videoCapabilities.maxReferences, undefined)
  assert.equal(result.videoCapabilities.maxAudioReferences, undefined)
})
