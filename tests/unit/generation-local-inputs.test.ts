import assert from 'node:assert/strict'
import test from 'node:test'
import { generationLocalInputIds, rememberGenerationInputIds } from '../../src/services/local-inputs.ts'

function stubStorage() {
  const entries = new Map<string, string>()
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value) },
      removeItem: (key: string) => { entries.delete(key) },
    },
  })
  return entries
}

test('重试按任务 id 还原本机参考素材 id', () => {
  stubStorage()
  rememberGenerationInputIds('job-1', { referenceIds: ['local:a'], audioIds: ['local:b'], maskId: 'local:c' })
  rememberGenerationInputIds('job-2', { referenceIds: [], audioIds: [] })

  assert.deepEqual(generationLocalInputIds('job-1'), { referenceIds: ['local:a'], audioIds: ['local:b'], maskId: 'local:c' })
  assert.equal(generationLocalInputIds('job-2'), undefined)
  assert.equal(generationLocalInputIds('job-unknown'), undefined)
})

test('本机素材 id 记录只保留最近 50 个任务', () => {
  stubStorage()
  for (let index = 0; index < 60; index += 1) {
    rememberGenerationInputIds(`job-${index}`, { referenceIds: [`local:${index}`], audioIds: [] })
  }

  assert.equal(generationLocalInputIds('job-9'), undefined)
  assert.deepEqual(generationLocalInputIds('job-59'), { referenceIds: ['local:59'], audioIds: [] })
})
