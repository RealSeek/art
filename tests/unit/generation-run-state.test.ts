import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveGenerationRunState } from '../../src/utils/generation-run-state.ts'

test('排队和运行中的生成任务可停止且不是终态', () => {
  for (const status of ['QUEUED', 'RUNNING'] as const) {
    const state = resolveGenerationRunState(status)
    assert.equal(state.isActive, true)
    assert.equal(state.canCancel, true)
    assert.equal(state.isTerminal, false)
    assert.equal(state.canRetry, false)
  }
})

test('成功任务是终态且不可停止或按失败重试', () => {
  const state = resolveGenerationRunState('SUCCEEDED')
  assert.equal(state.isSucceeded, true)
  assert.equal(state.isTerminal, true)
  assert.equal(state.canCancel, false)
  assert.equal(state.canRetry, false)
})

test('失败和取消任务统一允许重试', () => {
  for (const status of ['FAILED', 'CANCELLED'] as const) {
    const state = resolveGenerationRunState(status)
    assert.equal(state.isTerminal, true)
    assert.equal(state.canCancel, false)
    assert.equal(state.canRetry, true)
  }
})
