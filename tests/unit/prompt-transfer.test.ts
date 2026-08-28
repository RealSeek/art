import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeCreationPrompt, stageCreationPrompt } from '../../src/utils/prompt-transfer.ts'

function installSessionStorage() {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  })
  return values
}

test('创作提示词只消费当前结构化传输格式', () => {
  const values = installSessionStorage()
  values.set('xinyue:pending-creation-prompt:v2', '旧版纯文本提示词')
  assert.equal(consumeCreationPrompt('IMAGE'), null)

  stageCreationPrompt({ type: 'VIDEO', prompt: '生成视频', title: '标题', sourceName: '提示词库' })
  assert.equal(consumeCreationPrompt('IMAGE'), null)
  assert.deepEqual(consumeCreationPrompt('VIDEO'), {
    type: 'VIDEO',
    prompt: '生成视频',
    title: '标题',
    sourceName: '提示词库'
  })
})
