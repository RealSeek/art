import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransitionGeneration, isTerminalGenerationStatus } from '../../server/src/generations/generation-lifecycle'

const status = { QUEUED: 'QUEUED', RUNNING: 'RUNNING', SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED', CANCELLED: 'CANCELLED' } as const

test('生成任务只允许从排队进入运行、失败或取消', () => {
  assert.equal(canTransitionGeneration(status.QUEUED, status.RUNNING), true)
  assert.equal(canTransitionGeneration(status.QUEUED, status.SUCCEEDED), false)
  assert.equal(canTransitionGeneration(status.QUEUED, status.FAILED), true)
  assert.equal(canTransitionGeneration(status.QUEUED, status.CANCELLED), true)
})

test('运行任务允许完成、失败或取消，终态不可再次迁移', () => {
  assert.equal(canTransitionGeneration(status.RUNNING, status.SUCCEEDED), true)
  assert.equal(canTransitionGeneration(status.RUNNING, status.FAILED), true)
  assert.equal(canTransitionGeneration(status.RUNNING, status.CANCELLED), true)
  for (const terminal of [status.SUCCEEDED, status.FAILED, status.CANCELLED]) {
    assert.equal(isTerminalGenerationStatus(terminal), true)
    assert.equal(canTransitionGeneration(terminal, status.RUNNING), false)
  }
})
