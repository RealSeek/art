import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolLoopRunner } from '../../server/src/generations/tool-loop.runner'

test('tool loop can continue for multiple rounds and carries context', async () => {
  const runner = new ToolLoopRunner()
  const contexts: string[] = []
  let round = 0
  const outcome = await runner.run({
    maxRounds: 3,
    maxCallsPerRound: 1,
    maxTotalCalls: 3,
    plan: async (_current, context) => {
      contexts.push(context)
      round += 1
      return round < 3 ? [{ key: `tool-${round}`, input: {} }] : []
    },
    execute: async (calls) => calls.map((call) => ({ tool: call.key, status: 'SUCCEEDED', output: `${call.key}-ok` })),
  })
  assert.equal(outcome.rounds, 2)
  assert.equal(outcome.calls, 2)
  assert.equal(outcome.results.length, 2)
  assert.match(contexts[1], /tool-1-ok/)
})

test('tool loop stops at total call budget', async () => {
  const runner = new ToolLoopRunner()
  const outcome = await runner.run({
    maxRounds: 6,
    maxCallsPerRound: 2,
    maxTotalCalls: 3,
    plan: async () => [{ key: 'repeat', input: {} }, { key: 'repeat', input: {} }],
    execute: async (calls) => calls.map((call) => ({ tool: call.key, status: 'SUCCEEDED', output: 'ok' })),
  })
  assert.equal(outcome.calls, 3)
  assert.equal(outcome.results.length, 3)
  assert.equal(outcome.exhausted, true)
})
