import assert from 'node:assert/strict'
import test from 'node:test'
import type { CatalogModel } from '../../src/utils/model-catalog'
import { groupVideoModels, videoModelVariant, videoModelVariants } from '../../src/utils/video-model-variants'

const models: CatalogModel[] = ['', '[c]'].flatMap(prefix => ['480p', '720p', '2k', '2k-pro'].map(quality => ({
  key: `private:${prefix}${quality}`, upstreamModel: `${prefix}MiniMaxH3-${quality}`, displayName: `${prefix}MiniMaxH3 ${quality}`, capability: 'VIDEO' as const, source: 'USER' as const, isDefault: quality === '480p' && !prefix, availability: 'AVAILABLE' as const,
})))

test('MiniMax 画质合并保留实际模型键，且不同前缀互不切换', () => {
  const grouped = groupVideoModels(models, 'private:[c]720p')
  assert.deepEqual(grouped.map(model => model.displayName), ['MiniMax H3', '[C]MiniMax H3'])
  assert.equal(grouped[1].key, 'private:[c]720p')
  const variants = videoModelVariants(models, 'private:[c]720p')
  assert.deepEqual(variants.map(model => videoModelVariant(model)?.quality), ['480p', '720p', '2K', '2K Pro'])
  assert.ok(variants.every(model => model.upstreamModel?.startsWith('[c]')))
  assert.equal(variants.at(-1)?.key, 'private:[c]2k-pro')
})

test('画质只来自已配置可用型号，其他模型不做名称推断', () => {
  const partial = models.filter(model => !model.key.includes('2k')).map(model => ({ ...model, enabled: model.key !== 'private:720p' }))
  assert.deepEqual(videoModelVariants(partial, 'private:480p').map(model => videoModelVariant(model)?.quality), ['480p'])
  const other: CatalogModel = { key: 'seedance', displayName: 'Seedance 2.0', capability: 'VIDEO', isDefault: false }
  assert.deepEqual(groupVideoModels([other], other.key), [other])
  assert.equal(videoModelVariant({ ...other, upstreamModel: 'MiniMax-Hailuo-02' }), undefined)
})
