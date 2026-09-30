import assert from 'node:assert/strict'
import test from 'node:test'
import { availableImageTiers, imageResolutionTier, imageSizeForReferenceRatio, pickImageSize } from '../../src/utils/image-resolution.ts'
import { imageResolutionTier as serverResolutionTier } from '../../server/src/generations/image-options'

const sizes = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '4096x4096']

test('前端分档与后端计费分档保持一致', () => {
  for (const size of [...sizes, '512x512', '1792x1024', '4096x2048', '1024x4096']) {
    assert.equal(imageResolutionTier(size), serverResolutionTier(size))
  }
})

test('注意：档位按总像素划分，与上游 1K/2K/4K 价格档一致', () => {
  assert.equal(imageResolutionTier('1024x1024'), '1K')
  assert.equal(imageResolutionTier('1280x720'), '1K')
  assert.equal(imageResolutionTier('1024x1536'), '1K')
  assert.equal(imageResolutionTier('2048x2048'), '2K')
  assert.equal(imageResolutionTier('2048x1152'), '2K')
  assert.equal(imageResolutionTier('3520x2352'), '4K')
  assert.equal(imageResolutionTier('3840x2160'), '4K')
})

test('带参考图时输出尺寸跟随参考图比例', () => {
  assert.equal(imageSizeForReferenceRatio(16 / 9, '1K'), '1280x720')
  assert.equal(imageSizeForReferenceRatio(16 / 9, '4K'), '3840x2160')
  assert.equal(imageSizeForReferenceRatio(3 / 4, '2K'), '1512x2016')
  assert.equal(imageSizeForReferenceRatio(1, '1K'), '1024x1024')
  // 非标准比例按上游限制换算：16 的倍数、65.5万像素以上
  const wide = imageSizeForReferenceRatio(2.2, '1K') as string
  const [width, height] = wide.split('x').map(Number)
  assert.ok(width % 16 === 0 && height % 16 === 0)
  assert.ok(width * height >= 655_360 && width * height <= 8_294_400)
  // 超出允许比例范围时不跟随
  assert.equal(imageSizeForReferenceRatio(4, '1K'), null)
  assert.equal(imageSizeForReferenceRatio(0.2, '1K'), null)
})

test('画质档位只展示模型尺寸清单支持的档位', () => {
  assert.deepEqual(availableImageTiers(sizes), ['1K', '2K', '4K'])
  assert.deepEqual(availableImageTiers(['1024x1024']), ['1K'])
  assert.deepEqual(availableImageTiers(['2048x2048', '4096x4096']), ['2K', '4K'])
  assert.deepEqual(availableImageTiers([]), [])
})

test('按比例与档位挑选尺寸，自动比例沿用默认尺寸', () => {
  assert.equal(pickImageSize(sizes, '1K', '1:1', '1024x1024'), '1024x1024')
  assert.equal(pickImageSize(sizes, '2K', '1:1', '1024x1024'), '2048x2048')
  assert.equal(pickImageSize(sizes, '4K', '16:9', '1024x1024'), '4096x4096')
  assert.equal(pickImageSize(sizes, '1K', '自动', '1024x1024'), '1024x1024')
  assert.equal(pickImageSize(sizes, '2K', '自动', '1024x1024'), '2048x2048')
})

test('档位没有匹配尺寸时退回完整清单，避免选中不可用尺寸', () => {
  assert.equal(pickImageSize(['1024x1024', '1536x1024'], '4K', '16:9', '1024x1024'), '1536x1024')
  assert.equal(pickImageSize([], '1K', '1:1', '1024x1024'), '1024x1024')
})
