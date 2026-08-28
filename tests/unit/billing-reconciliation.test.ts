import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildJobLedgers,
  reconcileJobLedger
} from '../../server/src/admin/billing-reconciliation.ts'

test('成功任务的个人与团队账本统一按任务合并', () => {
  const ledgers = buildJobLedgers([
    { type: 'SPEND', amount: -8, referenceId: 'personal-job' },
    { type: 'SPEND', amount: -12, referenceId: 'team-job' }
  ])
  assert.deepEqual(reconcileJobLedger('SUCCEEDED', 8, ledgers.get('personal-job')).issues, [])
  assert.deepEqual(reconcileJobLedger('SUCCEEDED', 12, ledgers.get('team-job')).issues, [])
})

test('失败和取消任务必须退回全部预扣', () => {
  const ledgers = buildJobLedgers([
    { type: 'SPEND', amount: -10, referenceId: 'failed' },
    { type: 'REFUND', amount: 10, referenceId: 'failed' },
    { type: 'SPEND', amount: -6, referenceId: 'cancelled' }
  ])
  assert.deepEqual(reconcileJobLedger('FAILED', 10, ledgers.get('failed')).issues, [])
  assert.deepEqual(
    reconcileJobLedger('CANCELLED', 6, ledgers.get('cancelled')).issues.map((item) => item.code),
    ['REFUND_MISMATCH', 'LEDGER_MISMATCH']
  )
})

test('成功任务缺少扣款会标记 MISSING_SPEND', () => {
  assert.deepEqual(
    reconcileJobLedger('SUCCEEDED', 5).issues.map((item) => item.code),
    ['MISSING_SPEND']
  )
})
