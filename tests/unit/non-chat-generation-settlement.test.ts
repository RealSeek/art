import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationSettlementService } from '../../server/src/generations/generation-settlement.service'
import { TerminalSettlementError } from '../../server/src/generations/generation-provider-errors'

function harness(overrides: Record<string, unknown> = {}) {
  const updates: Array<Record<string, unknown>> = []
  const settlements: Array<Record<string, unknown>> = []
  const job = {
    id: 'job-image',
    userId: 'user-1',
    kind: 'IMAGE',
    status: 'RUNNING',
    settlementStatus: 'RESERVED',
    provider: 'system:OPENAI_COMPATIBLE',
    model: 'gpt-image-1',
    options: { billing: { subscriptionId: 'subscription-1' } },
    pricingSnapshot: { imageCostMicros: 40_000 },
    creditCost: 12,
    revenueMicros: 120_000,
    upstreamCostMicros: 40_000,
    ...overrides,
  }
  const prisma = {
    generationJob: {
      findUnique: async () => job,
      updateMany: async (input: Record<string, unknown>) => {
        updates.push(input)
        job.settlementStatus = 'RECONCILING'
        return { count: 1 }
      },
    },
    providerAttempt: {
      findFirst: async () => ({ id: 'attempt-1', metadata: { providerRequestId: 'provider-request-1' } }),
    },
    jobOutput: {
      count: async () => 1,
    },
  }
  const tokenQuota = {
    settleGeneration: async (input: Record<string, unknown>) => {
      settlements.push(input)
      return { settlements: [], idempotent: false }
    },
  }
  return {
    service: new GenerationSettlementService(prisma as never, tokenQuota as never),
    updates,
    settlements,
  }
}

test('non-chat settlement writes one creation-credit ledger without charging quota again', async () => {
  const { service, updates, settlements } = harness()
  await service.settleNonChat('job-image', 'attempt-1')

  assert.equal(updates.length, 1)
  assert.equal((updates[0]?.data as Record<string, unknown>).settlementStatus, 'RECONCILING')
  assert.equal(settlements.length, 1)
  const settlement = settlements[0]
  assert.deepEqual(settlement.reservations, [])
  const ledger = settlement.ledger as Record<string, unknown>
  assert.equal(ledger.quotaId, null)
  assert.equal(ledger.providerAttemptId, 'attempt-1')
  assert.equal(ledger.providerRequestId, 'provider-request-1')
  assert.equal(ledger.reservedUnits, 12n)
  assert.equal(ledger.chargedUnits, 12n)
  assert.equal((ledger.pricingSnapshot as Record<string, unknown>).ledgerUnit, 'CREATION_CREDIT')
})

test('non-chat settlement fails closed when no successful ProviderAttempt exists', async () => {
  const { service } = harness()
  const internal = service as unknown as {
    prisma: { providerAttempt: { findFirst: () => Promise<null> } }
  }
  internal.prisma.providerAttempt.findFirst = async () => null

  await assert.rejects(
    service.settleNonChat('job-image', 'attempt-missing'),
    (error: unknown) => error instanceof TerminalSettlementError && /ProviderAttempt/.test(error.message),
  )
})

test('chat jobs cannot enter the flat-rate settlement path', async () => {
  const { service } = harness({ kind: 'CHAT' })
  await assert.rejects(service.settleNonChat('job-image', 'attempt-1'), /仅用于非聊天/)
})

test('partial output persistence cannot be marked as settled', async () => {
  const { service, settlements } = harness({ kind: 'COMMERCE', options: { modules: 4, billing: {} } })
  const internal = service as unknown as {
    prisma: { jobOutput: { count: () => Promise<number> } }
  }
  internal.prisma.jobOutput.count = async () => 3

  await assert.rejects(service.settleNonChat('job-image', 'attempt-1'), /期望 4 项，实际 3 项/)
  assert.equal(settlements.length, 0)
})

test('ledger failure leaves the task in RECONCILING for retry without a Provider call', async () => {
  const { service, updates } = harness()
  const internal = service as unknown as {
    tokenQuota: { settleGeneration: () => Promise<never> }
  }
  internal.tokenQuota.settleGeneration = async () => { throw new Error('ledger unavailable') }

  await assert.rejects(
    service.settleNonChat('job-image', 'attempt-1'),
    (error: unknown) => error instanceof TerminalSettlementError && /ledger unavailable/.test(error.message),
  )
  assert.equal((updates[0]?.data as Record<string, unknown>).settlementStatus, 'RECONCILING')
})

test('non-chat settlement retry reuses the ledger idempotency key and only retries settlement', async () => {
  const { service, settlements } = harness()
  let attempts = 0
  const internal = service as unknown as {
    tokenQuota: { settleGeneration: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  }
  internal.tokenQuota.settleGeneration = async (input) => {
    settlements.push(input)
    attempts += 1
    if (attempts === 1) throw new Error('ledger temporarily unavailable')
    return { settlements: [], idempotent: false }
  }

  await assert.rejects(service.settleNonChat('job-image', 'attempt-1'), /ledger temporarily unavailable/)
  await service.settleNonChat('job-image', 'attempt-1')

  assert.equal(attempts, 2)
  const keys = settlements.map((entry) => {
    const ledger = entry.ledger as Record<string, unknown>
    return ledger.idempotencyKey
  })
  assert.deepEqual(keys, ['job:job-image:creation-ledger', 'job:job-image:creation-ledger'])
})
