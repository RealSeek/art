import assert from 'node:assert/strict'
import test from 'node:test'
import { ReconciliationRequiredError } from '../../server/src/generations/generation-provider-errors'
import { GenerationsProcessor } from '../../server/src/generations/generations.processor'

type MutableTask = Record<string, any>

function task(settlementStatus: 'RESERVED' | 'RECONCILING' | 'SETTLED' = 'RESERVED'): MutableTask {
  return {
    id: 'job-image',
    userId: 'user-1',
    kind: 'IMAGE',
    status: 'QUEUED',
    settlementStatus,
    model: 'image-model',
    provider: 'system:OPENAI_COMPATIBLE',
    providerChannelId: 'provider-1',
    options: { billing: { quotaEnabled: false } },
    pricingSnapshot: {},
    creditCost: 2,
    revenueMicros: 20_000,
    upstreamCostMicros: 10_000,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    billingTeamId: null,
    conversationId: null,
    lockedBy: null,
    leaseVersion: 0,
    leaseExpiresAt: null,
    createdAt: new Date(Date.now() - 60_000),
  }
}

function harness(initialStatus: 'RESERVED' | 'RECONCILING' | 'SETTLED' = 'RESERVED') {
  const current = task(initialStatus)
  const calls = {
    runner: 0,
    settlement: 0,
    capture: 0,
    usage: 0,
    succeed: 0,
    releaseForRetry: 0,
    refunds: 0,
    reservationReleases: 0,
  }
  let captureFailures = 0
  let settlementFailure: Error | null = null

  const prisma = {
    generationJob: {
      findUniqueOrThrow: async () => ({ ...current }),
      findUnique: async () => ({ ...current }),
      updateMany: async (input: { data?: Record<string, unknown> }) => {
        Object.assign(current, input.data || {})
        return { count: 1 }
      },
    },
    providerAttempt: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    jobOutput: { count: async () => 1 },
  }
  const lifecycle = {
    claim: async (_id: string, workerId: string) => {
      current.status = 'RUNNING'
      current.lockedBy = workerId
      current.leaseVersion += 1
      current.leaseExpiresAt = new Date(Date.now() + 60_000)
      return true
    },
    heartbeat: async () => ({ count: 1 }),
    succeed: async () => {
      calls.succeed += 1
      current.status = 'SUCCEEDED'
      current.lockedBy = null
      current.leaseExpiresAt = null
      return true
    },
    releaseForRetry: async () => {
      calls.releaseForRetry += 1
      current.status = 'QUEUED'
      current.lockedBy = null
      current.leaseExpiresAt = null
      return true
    },
  }
  const imageRunner = {
    kind: 'IMAGE' as const,
    run: async () => { calls.runner += 1 },
  }
  const settlement = {
    settleNonChat: async () => {
      calls.settlement += 1
      if (settlementFailure) {
        current.settlementStatus = 'RECONCILING'
        throw settlementFailure
      }
      current.settlementStatus = 'SETTLED'
    },
  }
  const billingTransactions = {
    recordCapture: async () => {
      calls.capture += 1
      if (captureFailures > 0) {
        captureFailures -= 1
        throw new Error('capture unavailable')
      }
    },
  }
  const credits = {
    refundOutstandingGeneration: async () => {
      calls.refunds += 1
      return null
    },
  }
  const tokenQuota = {
    release: async () => { calls.reservationReleases += 1 },
    reservationsForGeneration: async () => [],
  }
  const usageRecords = { record: async () => { calls.usage += 1 } }
  const noopRunner = { kind: 'CHAT' as const, run: async () => undefined }
  const videoRunner = { kind: 'VIDEO' as const, run: async () => undefined }
  const processor = new GenerationsProcessor(
    prisma as never,
    credits as never,
    billingTransactions as never,
    lifecycle as never,
    noopRunner as never,
    imageRunner as never,
    videoRunner as never,
    {} as never,
    usageRecords as never,
    tokenQuota as never,
    settlement as never,
    {} as never,
    {} as never,
  )
  const queueJob = (attemptsMade = 0) => ({
    data: { jobId: current.id },
    attemptsMade,
    opts: { attempts: 3 },
  }) as never

  return {
    processor,
    current,
    calls,
    queueJob,
    failCaptureOnce: () => { captureFailures = 1 },
    failSettlement: (error: Error) => { settlementFailure = error },
    restoreSettlement: () => { settlementFailure = null },
  }
}

test('a normal non-chat run settles before it can become SUCCEEDED', async () => {
  const state = harness()
  const result = await state.processor.process(state.queueJob())

  assert.equal(state.calls.runner, 1)
  assert.equal(state.calls.settlement, 1)
  assert.equal(state.calls.capture, 1)
  assert.equal(state.calls.usage, 1)
  assert.equal(state.calls.succeed, 1)
  assert.equal(result.status, 'SUCCEEDED')
  assert.equal(result.settlementStatus, 'SETTLED')
})

test('a RECONCILING non-chat job retries settlement without replaying the Provider', async () => {
  const state = harness('RECONCILING')
  await state.processor.process(state.queueJob(1))

  assert.equal(state.calls.runner, 0)
  assert.equal(state.calls.settlement, 1)
  assert.equal(state.calls.succeed, 1)
  assert.equal(state.current.status, 'SUCCEEDED')
})

test('post-settlement audit failure retries bookkeeping without replaying the Provider', async () => {
  const state = harness()
  state.failCaptureOnce()

  await assert.rejects(state.processor.process(state.queueJob()), /capture unavailable/)
  assert.equal(state.current.status, 'QUEUED')
  assert.equal(state.current.settlementStatus, 'SETTLED')
  assert.equal(state.calls.runner, 1)
  assert.equal(state.calls.releaseForRetry, 1)
  assert.equal(state.calls.succeed, 0)

  await state.processor.process(state.queueJob(1))
  assert.equal(state.calls.runner, 1)
  assert.equal(state.calls.settlement, 1)
  assert.equal(state.calls.capture, 2)
  assert.equal(state.calls.succeed, 1)
  assert.equal(state.current.status, 'SUCCEEDED')
})

test('settlement reconciliation requeues without refunding or releasing quota', async () => {
  const state = harness()
  state.failSettlement(new ReconciliationRequiredError('ledger unavailable'))

  await assert.rejects(state.processor.process(state.queueJob()), /ledger unavailable/)
  assert.equal(state.current.status, 'QUEUED')
  assert.equal(state.current.settlementStatus, 'RECONCILING')
  assert.equal(state.calls.runner, 1)
  assert.equal(state.calls.refunds, 0)
  assert.equal(state.calls.reservationReleases, 0)

  state.restoreSettlement()
  await state.processor.process(state.queueJob(1))
  assert.equal(state.calls.runner, 1)
  assert.equal(state.calls.settlement, 2)
  assert.equal(state.current.status, 'SUCCEEDED')
})
