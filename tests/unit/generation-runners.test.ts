import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { GenerationRunnerRegistry } from '../../server/src/generations/generation-runners'

test('Generation runner registry dispatches each capability independently', async () => {
  const calls: string[] = []
  const runner = (kind: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE') => ({ kind, run: async () => { calls.push(kind.toLowerCase()) } })
  const registry = new GenerationRunnerRegistry(['CHAT', 'IMAGE', 'VIDEO', 'COMMERCE'].map((kind) => runner(kind as 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE')))
  for (const kind of ['CHAT', 'IMAGE', 'VIDEO', 'COMMERCE'] as const) await registry.run({ kind } as never)
  assert.deepEqual(calls, ['chat', 'image', 'video', 'commerce'])
})

test('runner registry rejects unknown capabilities', () => {
  const registry = new GenerationRunnerRegistry()
  assert.throws(() => registry.get('AUDIO' as never), /No generation runner registered/)
})

test('Processor only orchestrates runners and contains no chat or video implementation', () => {
  const source = readFileSync('server/src/generations/generations.processor.ts', 'utf8')
  assert.doesNotMatch(source, /private async runChat/)
  assert.doesNotMatch(source, /private async runVideo/)
  assert.doesNotMatch(source, /providerChatStream/)
})
