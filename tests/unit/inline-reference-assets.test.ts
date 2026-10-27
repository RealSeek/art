import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeImageOptions } from '../../server/src/generations/image-options'
import { normalizeVideoOptions, videoCapabilities } from '../../server/src/generations/video-options'

const mp3 = { name: 'a.mp3', mimeType: 'audio/mpeg' }
const png = { name: 'a.png', mimeType: 'image/png' }

const imageCapabilities = {
  imageCapabilities: {
    sizes: ['1024x1024'],
    qualities: ['medium'],
    outputFormats: ['png'],
    backgrounds: ['auto'],
    maxCount: 4,
    supportsReference: true,
    supportsMask: true,
  },
}

const h3Capabilities = {
  videoCapabilities: {
    resolutions: ['2k'],
    durations: [5],
    aspectRatios: ['16:9'],
    defaultResolution: '2k',
    defaultDuration: 5,
    defaultAspectRatio: '16:9',
    maxReferences: 2,
    maxAudioReferences: 2,
    referenceMode: 'DATA_URL_JSON',
  },
}

test('图片选项接受浏览器内联参考图与蒙版', () => {
  const normalized = normalizeImageOptions({ size: '1024x1024', referenceImages: [{ name: 'a.png', mimeType: 'image/png', assetId: 'local-1' }], maskImage: { name: 'm.png', mimeType: 'image/png', assetId: 'local-mask' } }, imageCapabilities)
  assert.equal(normalized.referenceImages.length, 1)
  assert.equal(normalized.referenceImages[0].assetId, 'local-1')
  assert.equal(normalized.maskImage?.name, 'm.png')
  assert.equal(normalized.maskImage?.assetId, 'local-mask')
  assert.deepEqual(normalized.referenceAssetIds, [])
})

test('图片内联参考图与库内素材合并计数，超限即拒绝', () => {
  const references = Array.from({ length: 4 }, (_, index) => ({ name: `${index}.png`, mimeType: 'image/png', assetId: `local-${index}` }))
  assert.throws(() => normalizeImageOptions({ size: '1024x1024', referenceImages: references, referenceAssetIds: ['asset-1'] }, imageCapabilities), /参考图最多 4 张/)
})

test('内联蒙版同样要求带参考图，且需要模型支持', () => {
  assert.throws(() => normalizeImageOptions({ size: '1024x1024', maskImage: { name: 'm.png', mimeType: 'image/png', assetId: 'local-mask' } }, imageCapabilities), /使用蒙版前请先添加参考图/)
  assert.throws(() => normalizeImageOptions({ size: '1024x1024', referenceImages: [{ name: 'a.png', mimeType: 'image/png', assetId: 'local-1' }], maskImage: { name: 'm.png', mimeType: 'image/png', assetId: 'local-mask' } }, {
    imageCapabilities: { ...imageCapabilities.imageCapabilities, supportsMask: false },
  }), /不支持蒙版编辑/)
})

test('非图片素材不会被当成内联参考图', () => {
  const normalized = normalizeImageOptions({ size: '1024x1024', referenceImages: [{ name: 'a.png', mimeType: 'video/mp4', assetId: 'local-1' }, { name: 'b.mp3', mimeType: 'audio/mpeg', assetId: 'local-2' }] }, imageCapabilities)
  assert.equal(normalized.referenceImages.length, 0)
})

test('视频选项接受内联参考图与参考音频并合并限额', () => {
  const capabilities = videoCapabilities(h3Capabilities)
  const normalized = normalizeVideoOptions({
    duration: 5,
    referenceImages: [{ name: 'a.png', mimeType: 'image/png', assetId: 'local-image' }],
    referenceAudios: [{ name: 'a.mp3', mimeType: 'audio/mpeg', assetId: 'local-audio' }],
    referenceAssetIds: ['asset-1'],
  }, capabilities)
  assert.equal(normalized.referenceImages.length, 1)
  assert.equal(normalized.referenceAudios.length, 1)
  assert.equal(normalized.referenceAssetIds.length, 1)
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceImages: [{ mimeType: 'image/png' }, { mimeType: 'image/png' }], referenceAssetIds: ['a'] }, capabilities), /最多支持 2 张参考图/)
  assert.throws(() => normalizeVideoOptions({ duration: 5, referenceAudios: [{ mimeType: 'audio/mpeg' }] }, capabilities), /参考音频必须搭配至少一张参考图/)
})
