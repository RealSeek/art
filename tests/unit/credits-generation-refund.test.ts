import assert from 'node:assert/strict'
import test from 'node:test'
import { CreditsService } from '../../server/src/credits/credits.service'
import { runWithOutboundSignal } from '../../server/src/common/outbound-http'

function harness(status: string, settlementStatus: string, lease = { lockedBy: 'worker-1', leaseVersion: 7, leaseExpiresAt: new Date(Date.now() + 60_000) }) {
  const state = {
    balance: 75,
    version: 0,
    ledger: [] as Array<Record<string, unknown>>,
  }
  const tx = {
    creditLedger: {
      findUnique: async () => null,
      aggregate: async () => ({ _sum: { amount: -25 } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.ledger.push(data)
        return data
      },
    },
    creditAccount: {
      findUnique: async () => ({ id: 'account-1', userId: 'user-1', balance: state.balance, version: state.version }),
      findUniqueOrThrow: async () => ({ id: 'account-1', userId: 'user-1', balance: state.balance, version: state.version }),
      updateMany: async ({ where, data }: { where: { version: number }; data: { balance: number } }) => {
        if (where.version !== state.version) return { count: 0 }
        state.balance = data.balance
        state.version += 1
        return { count: 1 }
      },
    },
    generationJob: {
      findUnique: async () => ({ userId: 'user-1', billingTeamId: null, status, settlementStatus, ...lease }),
    },
  }
  const prisma = { $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) }
  return { service: new CreditsService(prisma as never), state }
}

test('失败且尚未结算的生成任务可以退还已扣创作点', async () => {
  const { service, state } = harness('FAILED', 'RESERVED')
  await service.refund('user-1', 25, '生成失败退款', 'job:job-1:failure-refund', { type: 'generation_job', id: 'job-1' })
  assert.equal(state.balance, 100)
  assert.equal(state.ledger.length, 1)
  assert.equal(state.ledger[0]?.amount, 25)
})

test('终态任务仍然不能继续扣除创作点', async () => {
  const { service, state } = harness('FAILED', 'RESERVED')
  await assert.rejects(
    service.spend('user-1', 25, '额外扣费', 'job:job-1:extra', { type: 'generation_job', id: 'job-1' }),
    /生成任务已结束，不能继续扣除创作点/,
  )
  assert.equal(state.balance, 75)
})

test('已经完成 Token 结算的任务不能重复退款', async () => {
  const { service, state } = harness('CANCELLED', 'SETTLED')
  await assert.rejects(
    service.refund('user-1', 25, '取消退款', 'job:job-1:cancel-refund', { type: 'generation_job', id: 'job-1' }),
    /生成任务已完成结算，不能重复退款/,
  )
  assert.equal(state.balance, 75)
})

test('丢失 worker lease 后不能继续扣除创作点', async () => {
  const { service, state } = harness('RUNNING', 'RECONCILING', {
    lockedBy: 'worker-2',
    leaseVersion: 8,
    leaseExpiresAt: new Date(Date.now() + 60_000),
  })

  await assert.rejects(
    runWithOutboundSignal(
      new AbortController().signal,
      () => service.spend('user-1', 25, '实际用量补扣', 'job:job-1:extra', { type: 'generation_job', id: 'job-1' }),
      { workerId: 'worker-1', leaseVersion: 7 },
    ),
    /执行租约已失效/,
  )
  assert.equal(state.balance, 75)
  assert.equal(state.ledger.length, 0)
})
