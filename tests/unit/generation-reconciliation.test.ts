import assert from 'node:assert/strict'
import test from 'node:test'
import { ReconciliationRequiredError } from '../../server/src/generations/generation-provider-errors'
import { GenerationReconciliationService } from '../../server/src/generations/generation-reconciliation.service'
import { GenerationsProcessor } from '../../server/src/generations/generations.processor'

type SettlementStatus = 'PENDING' | 'RESERVED' | 'SETTLED' | 'RELEASED' | 'REFUNDED' | 'RECONCILING'
type Reservation = { reservationId: string; quotaId: string; status: 'RESERVED' | 'RELEASED' | 'SETTLED'; reservedUnits: bigint }

function reconciliationHarness(reason: 'FAILED' | 'CANCELLED' = 'FAILED', settlementStatus: SettlementStatus = 'RESERVED') {
  const job: Record<string, any> = {
    id: 'job-reconcile', userId: 'user-1', status: reason, settlementStatus,
    kind: 'CHAT', provider: 'system:OPENAI_COMPATIBLE', billingTeamId: null,
  }
  const attempt = { id: 'attempt-1', status: 'RUNNING', errorCode: null as string | null }
  const reservations: Reservation[] = [
    { reservationId: 'reservation-monthly', quotaId: 'quota-monthly', status: settlementStatus === 'SETTLED' ? 'SETTLED' : 'RESERVED', reservedUnits: 100n },
    { reservationId: 'reservation-daily', quotaId: 'quota-daily', status: settlementStatus === 'SETTLED' ? 'SETTLED' : 'RESERVED', reservedUnits: 100n },
  ]
  const calls = { refunds: 0, billingWrites: 0, releases: 0, attemptUpdates: 0 }
  const refundEntries = new Map<string, number>()
  const billingEntries = new Set<string>()
  let billingFailures = 0
  let releaseFailureQuota: string | null = null

  const matches = (where: Record<string, any>) => {
    if (where.id !== undefined && where.id !== job.id) return false
    if (where.status !== undefined && where.status !== job.status) return false
    if (where.settlementStatus?.in && !where.settlementStatus.in.includes(job.settlementStatus)) return false
    return true
  }
  const prisma = {
    generationJob: {
      findUnique: async () => ({ ...job }),
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 }
        Object.assign(job, data)
        return { count: 1 }
      },
    },
    providerAttempt: {
      updateMany: async ({ where, data }: { where: { status: string }; data: Record<string, any> }) => {
        if (attempt.status !== where.status) return { count: 0 }
        calls.attemptUpdates += 1
        Object.assign(attempt, data)
        return { count: 1 }
      },
    },
  }
  const credits = {
    refundOutstandingGeneration: async (_userId: string, _generationId: string, _description: string, key: string) => {
      if (!refundEntries.has(key)) {
        refundEntries.set(key, 5)
        calls.refunds += 1
      }
      return { amount: refundEntries.get(key) || 0 }
    },
  }
  const billingTransactions = {
    recordRefund: async ({ idempotencyKey }: { idempotencyKey: string }) => {
      if (billingFailures > 0) { billingFailures -= 1; throw new Error('billing audit unavailable') }
      if (!billingEntries.has(idempotencyKey)) {
        billingEntries.add(idempotencyKey)
        calls.billingWrites += 1
      }
    },
  }
  const tokenQuota = {
    reservationsForGeneration: async () => reservations.map((row) => ({
      ...row, userId: job.userId, generationId: job.id, chargedUnits: 0n, scopeKey: row.quotaId,
    })),
    release: async ({ reservationId, quotaId }: { reservationId: string; quotaId: string }) => {
      if (releaseFailureQuota === quotaId) { releaseFailureQuota = null; throw new Error('quota release unavailable') }
      const row = reservations.find((item) => item.reservationId === reservationId)
      if (!row || row.status !== 'RESERVED') return { releasedUnits: row?.reservedUnits || 0n }
      row.status = 'RELEASED'
      calls.releases += 1
      return { releasedUnits: row.reservedUnits }
    },
  }
  const service = new GenerationReconciliationService(prisma as never, credits as never, billingTransactions as never, tokenQuota as never)
  return {
    service, job, attempt, reservations, calls,
    failBillingOnce: () => { billingFailures = 1 },
    failReleaseOnce: (quotaId: string) => { releaseFailureQuota = quotaId },
  }
}

test('terminal reconciliation is idempotent across concurrent workers', async () => {
  const state = reconciliationHarness('CANCELLED')

  await Promise.all([
    state.service.finalizeTerminal(state.job.id, 'CANCELLED'),
    state.service.finalizeTerminal(state.job.id, 'CANCELLED'),
  ])

  assert.equal(state.job.settlementStatus, 'REFUNDED')
  assert.equal(state.attempt.status, 'FAILED')
  assert.equal(state.calls.refunds, 1)
  assert.equal(state.calls.billingWrites, 1)
  assert.equal(state.calls.releases, 2)
  assert.equal(state.reservations.every((row) => row.status === 'RELEASED'), true)
})

test('a partial reconciliation remains RECONCILING and resumes without a duplicate refund', async () => {
  const state = reconciliationHarness()
  state.failBillingOnce()

  await assert.rejects(state.service.finalizeTerminal(state.job.id, 'FAILED'), /billing audit unavailable/)
  assert.equal(state.job.settlementStatus, 'RECONCILING')
  assert.equal(state.reservations.every((row) => row.status === 'RESERVED'), true)
  assert.equal(state.calls.refunds, 1)

  state.failReleaseOnce('quota-daily')
  await state.service.finalizeTerminal(state.job.id, 'FAILED')
  assert.equal(state.job.settlementStatus, 'RECONCILING')
  assert.equal(state.calls.refunds, 1)
  assert.equal(state.reservations.filter((row) => row.status === 'RELEASED').length, 1)

  await state.service.finalizeTerminal(state.job.id, 'FAILED')
  assert.equal(state.job.settlementStatus, 'REFUNDED')
  assert.equal(state.calls.refunds, 1)
  assert.equal(state.calls.billingWrites, 1)
  assert.equal(state.reservations.every((row) => row.status === 'RELEASED'), true)
})

test('a SETTLED terminal task is never refunded or released', async () => {
  const state = reconciliationHarness('FAILED', 'SETTLED')

  await state.service.finalizeTerminal(state.job.id, 'FAILED')

  assert.equal(state.job.settlementStatus, 'SETTLED')
  assert.equal(state.attempt.status, 'RUNNING')
  assert.deepEqual(state.calls, { refunds: 0, billingWrites: 0, releases: 0, attemptUpdates: 0 })
})

test('mixed reservation states fail closed before issuing a refund', async () => {
  const state = reconciliationHarness('FAILED', 'RESERVED')
  state.reservations[0].status = 'SETTLED'

  await state.service.finalizeTerminal(state.job.id, 'FAILED')

  assert.equal(state.job.settlementStatus, 'RECONCILING')
  assert.equal(state.calls.refunds, 0)
  assert.equal(state.calls.billingWrites, 0)
  assert.equal(state.calls.releases, 0)
  assert.equal(state.calls.attemptUpdates, 0)
})

function processorTask() {
  return {
    id: 'job-stream', userId: 'user-1', kind: 'CHAT', status: 'QUEUED', settlementStatus: 'RESERVED',
    model: 'gpt-test', provider: 'system:OPENAI_COMPATIBLE', providerChannelId: null, billingTeamId: null,
    conversationId: null, options: { billing: { quotaEnabled: false } }, pricingSnapshot: {}, creditCost: 5,
    inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, upstreamCostMicros: 0,
    lockedBy: null as string | null, leaseVersion: 0, leaseExpiresAt: null as Date | null,
    createdAt: new Date(0),
  }
}

test('a stale worker cannot finalize an attempt after losing its lease', async () => {
  const task = processorTask()
  task.settlementStatus = 'RECONCILING'
  let reconciliationCalls = 0
  let providerCalls = 0
  const prisma = {
    generationJob: {
      findUniqueOrThrow: async () => ({ ...task }),
    },
  }
  const lifecycle = {
    claim: async (_id: string, workerId: string) => {
      task.status = 'RUNNING'; task.lockedBy = workerId; task.leaseVersion += 1; task.leaseExpiresAt = new Date(Date.now() + 60_000)
      return true
    },
    heartbeat: async () => ({ count: 1 }),
    fail: async () => {
      task.lockedBy = 'new-worker'; task.leaseVersion += 1; task.leaseExpiresAt = new Date(Date.now() + 60_000)
      return false
    },
  }
  const processor = new GenerationsProcessor(
    prisma as never, {} as never, {} as never, lifecycle as never,
    { kind: 'CHAT', run: async () => { providerCalls += 1 } } as never,
    { kind: 'IMAGE', run: async () => undefined } as never,
    { kind: 'VIDEO', run: async () => undefined } as never,
    {} as never, {} as never, {} as never, {} as never,
    { finalizeTerminal: async () => { reconciliationCalls += 1 } } as never,
    {} as never,
  )

  const result = await processor.process({ data: { jobId: task.id }, attemptsMade: 0, opts: { attempts: 3 } } as never)

  assert.equal(result.status, 'RUNNING')
  assert.equal(result.lockedBy, 'new-worker')
  assert.equal(providerCalls, 0)
  assert.equal(reconciliationCalls, 0)
})

test('an interrupted Chat stream becomes terminal without replaying the Provider', async () => {
  const task = processorTask()
  const attempts = [{ id: 'attempt-stream', status: 'RUNNING' }]
  const reservations = [{ reservationId: 'reservation-stream', quotaId: 'quota-stream', status: 'RESERVED' as const, reservedUnits: 100n }]
  let providerCalls = 0
  let refunds = 0
  const matches = (where: Record<string, any>) => {
    if (where.status !== undefined && where.status !== task.status) return false
    if (where.lockedBy !== undefined && where.lockedBy !== task.lockedBy) return false
    if (where.leaseVersion !== undefined && where.leaseVersion !== task.leaseVersion) return false
    if (where.settlementStatus?.in && !where.settlementStatus.in.includes(task.settlementStatus)) return false
    return true
  }
  const prisma = {
    generationJob: {
      findUniqueOrThrow: async () => ({ ...task }),
      findUnique: async () => ({ ...task }),
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 }
        Object.assign(task, data)
        return { count: 1 }
      },
    },
    providerAttempt: {
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
        const selected = attempts.filter((row) => row.status === where.status)
        selected.forEach((row) => Object.assign(row, data))
        return { count: selected.length }
      },
    },
    pluginUsage: { updateMany: async () => ({ count: 0 }) },
    message: { deleteMany: async () => ({ count: 0 }) },
    jobOutput: { count: async () => 0 },
  }
  const credits = {
    refundOutstandingGeneration: async () => { refunds += 1; return { amount: 5 } },
  }
  const billingTransactions = { recordRefund: async () => undefined }
  const tokenQuota = {
    reservationsForGeneration: async () => reservations.map((row) => ({ ...row, userId: task.userId, generationId: task.id, chargedUnits: 0n, scopeKey: row.quotaId })),
    release: async () => { reservations[0].status = 'RELEASED' as never; return { releasedUnits: 100n } },
  }
  const reconciliation = new GenerationReconciliationService(prisma as never, credits as never, billingTransactions as never, tokenQuota as never)
  const lifecycle = {
    claim: async (_id: string, workerId: string) => {
      if (task.status !== 'QUEUED') return false
      task.status = 'RUNNING'; task.lockedBy = workerId; task.leaseVersion += 1; task.leaseExpiresAt = new Date(Date.now() + 60_000)
      return true
    },
    heartbeat: async () => ({ count: 1 }),
    fail: async (_id: string, _code: string, _message: string, _payload: unknown, lease: { workerId: string; leaseVersion: number }) => {
      if (task.status !== 'RUNNING' || task.lockedBy !== lease.workerId || task.leaseVersion !== lease.leaseVersion) return false
      task.status = 'FAILED'; task.lockedBy = null; task.leaseExpiresAt = null
      return true
    },
  }
  const processor = new GenerationsProcessor(
    prisma as never, {} as never, {} as never, lifecycle as never,
    { kind: 'CHAT', run: async () => { providerCalls += 1; throw new ReconciliationRequiredError('socket reset') } } as never,
    { kind: 'IMAGE', run: async () => undefined } as never,
    { kind: 'VIDEO', run: async () => undefined } as never,
    {} as never,
    { record: async () => undefined } as never,
    tokenQuota as never, {} as never, reconciliation, {} as never,
  )
  const queueJob = { data: { jobId: task.id }, attemptsMade: 0, opts: { attempts: 3 } } as never

  const result = await processor.process(queueJob)
  assert.equal(result.status, 'FAILED')
  assert.equal(result.settlementStatus, 'REFUNDED')
  assert.equal(attempts[0].status, 'FAILED')
  assert.equal(reservations[0].status, 'RELEASED')
  assert.equal(providerCalls, 1)
  assert.equal(refunds, 1)

  await processor.process(queueJob)
  assert.equal(providerCalls, 1)
  assert.equal(refunds, 1)
})

test('a final non-Chat reconciliation failure becomes terminal without replay or duplicate refund', async () => {
  const task = {
    ...processorTask(),
    id: 'job-image-reconcile',
    kind: 'IMAGE',
    settlementStatus: 'RECONCILING',
    providerChannelId: 'provider-1',
  }
  const attempt = { id: 'attempt-image', status: 'RUNNING', errorCode: null as string | null }
  const reservation = { reservationId: 'reservation-image', quotaId: 'quota-image', status: 'RESERVED' as const, reservedUnits: 100n }
  const calls = { runner: 0, settlement: 0, refunds: 0, billingWrites: 0, releases: 0, cleanup: 0 }
  let refundCreated = false
  const matches = (where: Record<string, any>) => {
    if (where.id !== undefined && where.id !== task.id) return false
    if (where.status !== undefined && where.status !== task.status) return false
    if (where.lockedBy !== undefined && where.lockedBy !== task.lockedBy) return false
    if (where.leaseVersion !== undefined && where.leaseVersion !== task.leaseVersion) return false
    if (where.settlementStatus?.in && !where.settlementStatus.in.includes(task.settlementStatus)) return false
    return true
  }
  const prisma = {
    generationJob: {
      findUniqueOrThrow: async () => ({ ...task }),
      findUnique: async () => ({ ...task }),
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 }
        Object.assign(task, data)
        return { count: 1 }
      },
    },
    providerAttempt: {
      findMany: async () => [],
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
        if (attempt.status !== where.status) return { count: 0 }
        Object.assign(attempt, data)
        return { count: 1 }
      },
    },
    pluginUsage: { updateMany: async () => ({ count: 0 }) },
    message: { deleteMany: async () => ({ count: 0 }) },
    jobOutput: { count: async () => 0 },
  }
  const lifecycle = {
    claim: async (_id: string, workerId: string) => {
      if (task.status !== 'QUEUED') return false
      task.status = 'RUNNING'
      task.lockedBy = workerId
      task.leaseVersion += 1
      task.leaseExpiresAt = new Date(Date.now() + 60_000)
      return true
    },
    heartbeat: async () => ({ count: 1 }),
    fail: async (_id: string, _code: string, _message: string, _payload: unknown, lease: { workerId: string; leaseVersion: number }) => {
      if (task.status !== 'RUNNING' || task.lockedBy !== lease.workerId || task.leaseVersion !== lease.leaseVersion) return false
      task.status = 'FAILED'
      task.lockedBy = null
      task.leaseExpiresAt = null
      return true
    },
  }
  const credits = {
    refundOutstandingGeneration: async () => {
      if (!refundCreated) {
        refundCreated = true
        calls.refunds += 1
      }
      return { amount: 5 }
    },
  }
  const billingTransactions = { recordRefund: async () => { calls.billingWrites += 1 } }
  const tokenQuota = {
    reservationsForGeneration: async () => [{ ...reservation, userId: task.userId, generationId: task.id, chargedUnits: 0n, scopeKey: reservation.quotaId }],
    release: async () => {
      if (reservation.status === 'RESERVED') {
        reservation.status = 'RELEASED' as never
        calls.releases += 1
      }
      return { releasedUnits: reservation.reservedUnits }
    },
  }
  const reconciliation = new GenerationReconciliationService(prisma as never, credits as never, billingTransactions as never, tokenQuota as never)
  const processor = new GenerationsProcessor(
    prisma as never,
    credits as never,
    billingTransactions as never,
    lifecycle as never,
    { kind: 'CHAT', run: async () => undefined } as never,
    { kind: 'IMAGE', run: async () => { calls.runner += 1 } } as never,
    { kind: 'VIDEO', run: async () => undefined } as never,
    { cleanup: async () => { calls.cleanup += 1 } } as never,
    { record: async () => undefined } as never,
    tokenQuota as never,
    { settleNonChat: async () => { calls.settlement += 1; throw new ReconciliationRequiredError('ledger unavailable') } } as never,
    reconciliation,
    {} as never,
  )
  const queueJob = { data: { jobId: task.id }, attemptsMade: 2, opts: { attempts: 3 } } as never

  const result = await processor.process(queueJob)
  assert.equal(result.status, 'FAILED')
  assert.equal(result.settlementStatus, 'REFUNDED')
  assert.equal(attempt.status, 'FAILED')
  assert.equal(reservation.status, 'RELEASED')
  assert.deepEqual(calls, { runner: 0, settlement: 1, refunds: 1, billingWrites: 1, releases: 1, cleanup: 1 })

  await processor.process(queueJob)
  assert.deepEqual(calls, { runner: 0, settlement: 1, refunds: 1, billingWrites: 1, releases: 1, cleanup: 1 })
})
