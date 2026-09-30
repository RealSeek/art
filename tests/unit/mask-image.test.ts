import assert from 'node:assert/strict'
import test from 'node:test'
import { maskFormatForTarget, regionEditAvailable, writeMaskPixels } from '../../src/utils/mask-image.ts'
import type { CatalogModel } from '../../src/utils/model-catalog.ts'

const imageModel = (overrides: Partial<CatalogModel> & { supportsMask?: boolean; apiProtocol?: string } = {}) => {
  const { supportsMask = false, apiProtocol = 'openai', ...rest } = overrides
  return {
    key: 'image-model',
    displayName: 'Image Model',
    capability: 'IMAGE',
    isDefault: false,
    apiProtocol,
    options: { imageCapabilities: { supportsMask } },
    ...rest,
  } as CatalogModel
}

test('本地 Worker 使用白底蒙版，OpenAI 兼容渠道使用透明选区', () => {
  assert.equal(maskFormatForTarget(imageModel(), { worker: true }), 'OPAQUE_WHITE')
  assert.equal(maskFormatForTarget(imageModel({ provider: { type: 'LOCAL_WORKER' } })), 'OPAQUE_WHITE')
  assert.equal(maskFormatForTarget(imageModel()), 'ALPHA_TRANSPARENT')
})

test('区域编辑只在支持蒙版的图片模型或本地 Worker 上开放', () => {
  assert.equal(regionEditAvailable(imageModel({ supportsMask: true })), true)
  assert.equal(regionEditAvailable(imageModel()), false)
  assert.equal(regionEditAvailable(imageModel({ supportsMask: true, apiProtocol: 'gemini' })), false)
  assert.equal(regionEditAvailable(imageModel(), { worker: true }), true)
  assert.equal(regionEditAvailable(null), false)
})

test('白底蒙版把选区写成白色，透明蒙版把选区写成透明', () => {
  const selection = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 0])
  assert.deepEqual([...writeMaskPixels(selection, 'OPAQUE_WHITE')], [
    255, 255, 255, 255,
    128, 128, 128, 255,
    0, 0, 0, 255,
  ])
  assert.deepEqual([...writeMaskPixels(selection, 'ALPHA_TRANSPARENT')], [
    0, 0, 0, 0,
    0, 0, 0, 127,
    0, 0, 0, 255,
  ])
})
