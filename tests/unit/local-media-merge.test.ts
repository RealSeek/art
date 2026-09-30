import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeLocalAssets } from '../../src/utils/local-media-merge.ts'
import type { StudioAsset } from '../../src/types.ts'

const asset = (id: string, createdAt: number, extra: Partial<StudioAsset> = {}) => ({ id, kind: 'image', title: id, prompt: '', preview: '', status: 'done', createdAt, tags: [], ...extra }) as StudioAsset

test('本机副本与服务器素材合并：同 id 以服务器为准，仅本机的条目保留', () => {
  const server = [asset('a', 3000), asset('b', 1000)]
  const local = [asset('a', 3000, { title: '本机副本' }), asset('c', 2000, { title: '本机独有' })]
  const merged = mergeLocalAssets(server, local)
  assert.deepEqual(merged.map((item) => item.id), ['a', 'c', 'b'])
  assert.equal(merged.find((item) => item.id === 'a')?.title, 'a')
})

test('没有本机副本时保持服务器顺序与内容', () => {
  const server = [asset('x', 10), asset('y', 20)]
  assert.deepEqual(mergeLocalAssets(server, []).map((item) => item.id), ['y', 'x'])
})
