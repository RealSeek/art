import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultCatalogModel, type CatalogModel } from '../../src/utils/model-catalog.ts'

const model = (key: string, capability: CatalogModel['capability'], isDefault = false) => ({
  key,
  displayName: key,
  capability,
  isDefault,
}) as CatalogModel

test('模型目录优先使用能力内的默认模型', () => {
  const models = [model('chat-a', 'CHAT'), model('chat-b', 'CHAT', true), model('image-a', 'IMAGE')]
  assert.equal(defaultCatalogModel(models, 'CHAT')?.key, 'chat-b')
  assert.equal(defaultCatalogModel(models, 'IMAGE')?.key, 'image-a')
})

test('没有对应能力时不伪造默认模型', () => {
  assert.equal(defaultCatalogModel([model('chat-a', 'CHAT')], 'VIDEO'), undefined)
})
