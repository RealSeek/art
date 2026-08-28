import assert from 'node:assert/strict'
import test from 'node:test'
import { BillingTransactionsService } from '../../server/src/credits/billing-transactions.service'

test('账务交易使用幂等 upsert 且预扣方向为支出', async () => {
  let args: Record<string, unknown> | undefined
  const service = new BillingTransactionsService({ billingTransaction: { upsert: async (input: Record<string, unknown>) => { args = input; return input } } } as never)
  await service.recordPreAuth({ userId: 'user-1', generationId: 'job-1', amount: 8, idempotencyKey: 'job:job-1:pre-auth' })
  assert.deepEqual((args?.where as Record<string, unknown>).idempotencyKey, 'job:job-1:pre-auth')
  assert.equal((args?.create as Record<string, unknown>).type, 'PRE_AUTH')
  assert.equal((args?.create as Record<string, unknown>).direction, 'DEBIT')
})

test('账务退款记录为入账并清理无效用量', async () => {
  let create: Record<string, unknown> = {}
  const service = new BillingTransactionsService({ billingTransaction: { upsert: async (input: { create: Record<string, unknown> }) => { create = input.create; return input } } } as never)
  await service.recordRefund({ userId: 'user-1', amount: 3, inputTokens: -10, outputTokens: Number.NaN, idempotencyKey: 'refund-1' })
  assert.equal(create.type, 'REFUND')
  assert.equal(create.direction, 'CREDIT')
  assert.equal(create.inputTokens, 0)
  assert.equal(create.outputTokens, 0)
})
