import assert from 'node:assert/strict'
import test from 'node:test'
import { availableImageTiers, imageResolutionTier, pickImageSize } from '../../src/utils/image-resolution.ts'
import { imageResolutionTier as serverResolutionTier } from '../../server/src/generations/image-options'

const sizes = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '4096x4096']

test('前端分档与后端计费分档保持一致', () => {
  for (const size of [...sizes, '512x512', '1792x1024', '4096x2048', '1024x4096']) {
    assert.equal(imageResolutionTier(size), serverResolutionTier(size))
  }
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
