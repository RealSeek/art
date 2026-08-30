import assert from 'node:assert/strict'
import test from 'node:test'
import { TokenQuotaService } from '../../server/src/billing/token-quota.service'

const GenerationSettlementStatus = { RESERVED: 'RESERVED', SETTLED: 'SETTLED' } as const
const TokenLedgerType = { CHARGE: 'CHARGE', ADJUST: 'ADJUST' } as const
const TokenQuotaReservationStatus = { RESERVED: 'RESERVED', SETTLED: 'SETTLED', RELEASED: 'RELEASED' } as const
const TokenQuotaStatus = { ACTIVE: 'ACTIVE' } as const
const TokenSettlementStatus = { SETTLED: 'SETTLED' } as const
const TokenUsageSource = { PROVIDER: 'PROVIDER' } as const

type QuotaRow = {
  id: string
  userId: string
  subscriptionId: string | null
  scopeKey: string
  periodStart: Date
  periodEnd: Date
  grantedUnits: bigint
  reservedUnits: bigint
  usedUnits: bigint
  version: number
  inputTokens: bigint
  outputTokens: bigint
  cachedInputTokens: bigint
  reasoningTokens: bigint
  status: string
}

type ReservationRow = {
  id: string
  userId: string
  quotaId: string
  generationId: string
  reservedUnits: bigint
  chargedUnits: bigint
  status: string
  metadata?: unknown
  settledAt: Date | null
  releasedAt: Date | null
}

type JobRow = {
  id: string
  userId: string
  status: string
  settlementStatus: string
}

type TestState = {
  quotas: QuotaRow[]
  reservations: ReservationRow[]
  events: Array<Record<string, unknown> & { id: string; idempotencyKey: string }>
  ledgers: Array<Record<string, unknown> & { id: string; idempotencyKey: string }>
  jobs: JobRow[]
}

type Mutation = bigint | number | string | Date | null | undefined | { increment?: bigint | number; decrement?: bigint | number }

const USER_ID = 'user-1'
const PERIOD_START = new Date('2026-08-01T00:00:00.000Z')
const PERIOD_END = new Date('2026-09-01T00:00:00.000Z')

function isConflict(error: unknown, message: string) {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && error.message === message
    && 'getStatus' in error
    && typeof error.getStatus === 'function'
    && error.getStatus() === 409
}

function matchesValue(actual: unknown, expected: unknown) {
  if (expected && typeof expected === 'object' && 'in' in expected) {
    return (expected.in as unknown[]).includes(actual)
  }
  return actual === expected
}

function matchesRow(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, expected]) => matchesValue(row[key], expected))
}

function addNumeric(current: unknown, delta: bigint | number, direction: 1 | -1): bigint | number {
  if (typeof current === 'bigint') return current + BigInt(delta) * BigInt(direction)
  return Number(current) + Number(delta) * direction
}

function applyMutations(row: Record<string, unknown>, data: Record<string, Mutation>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value.increment !== undefined) row[key] = addNumeric(row[key], value.increment, 1)
      if (value.decrement !== undefined) row[key] = addNumeric(row[key], value.decrement, -1)
      continue
    }
    row[key] = value
  }
}

function createPrismaHarness() {
  let state: TestState = {
    quotas: [],
    reservations: [],
    events: [],
    ledgers: [],
    jobs: [
      { id: 'job-a', userId: USER_ID, status: 'RUNNING', settlementStatus: GenerationSettlementStatus.RESERVED },
      { id: 'job-b', userId: USER_ID, status: 'RUNNING', settlementStatus: GenerationSettlementStatus.RESERVED },
    ],
  }
  let sequence = 0
  let failLedgerWrite = false
  let failLedgerKey: string | null = null
  let transactionTail: Promise<void> = Promise.resolve()

  const nextId = (prefix: string) => `${prefix}-${++sequence}`
  const clone = <T>(value: T): T => structuredClone(value)

  function transactionClient(draft: TestState) {
    return {
      userTokenQuota: {
        upsert: async (args: {
          where: { userId_scopeKey_periodStart: { userId: string; scopeKey: string; periodStart: Date } }
          create: Omit<QuotaRow, 'id' | 'reservedUnits' | 'usedUnits' | 'version' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'reasoningTokens' | 'status'>
        }) => {
          const key = args.where.userId_scopeKey_periodStart
          let quota = draft.quotas.find((row) => row.userId === key.userId
            && row.scopeKey === key.scopeKey
            && row.periodStart.getTime() === key.periodStart.getTime())
          if (!quota) {
            quota = {
              ...args.create,
              id: nextId('quota'),
              reservedUnits: 0n,
              usedUnits: 0n,
              version: 0,
              inputTokens: 0n,
              outputTokens: 0n,
              cachedInputTokens: 0n,
              reasoningTokens: 0n,
              status: TokenQuotaStatus.ACTIVE,
            }
            draft.quotas.push(quota)
          }
          return clone(quota)
        },
        findUniqueOrThrow: async (args: { where: { id: string } }) => {
          const quota = draft.quotas.find((row) => row.id === args.where.id)
          if (!quota) throw new Error('quota not found')
          return clone(quota)
        },
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, Mutation> }) => {
          const quota = draft.quotas.find((row) => matchesRow(row as unknown as Record<string, unknown>, args.where))
          if (!quota) return { count: 0 }
          applyMutations(quota as unknown as Record<string, unknown>, args.data)
          return { count: 1 }
        },
      },
      tokenQuotaReservation: {
        findMany: async (args: { where: { userId: string; generationId: string }; select?: Record<string, unknown> }) => {
          return draft.reservations
            .filter((row) => row.userId === args.where.userId && row.generationId === args.where.generationId)
            .map((row) => ({ id: row.id, quotaId: row.quotaId, status: row.status }))
        },
        findUnique: async (args: {
          where: { id?: string; generationId_quotaId?: { generationId: string; quotaId: string } }
        }) => {
          const row = args.where.id
            ? draft.reservations.find((item) => item.id === args.where.id)
            : draft.reservations.find((item) => item.generationId === args.where.generationId_quotaId?.generationId
              && item.quotaId === args.where.generationId_quotaId?.quotaId)
          return row ? clone(row) : null
        },
        create: async (args: { data: Omit<ReservationRow, 'id' | 'chargedUnits' | 'status' | 'settledAt' | 'releasedAt'> }) => {
          const row: ReservationRow = {
            ...args.data,
            id: nextId('reservation'),
            chargedUnits: 0n,
            status: TokenQuotaReservationStatus.RESERVED,
            settledAt: null,
            releasedAt: null,
          }
          draft.reservations.push(row)
          return clone(row)
        },
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, Mutation> }) => {
          const row = draft.reservations.find((item) => matchesRow(item as unknown as Record<string, unknown>, args.where))
          if (!row) return { count: 0 }
          applyMutations(row as unknown as Record<string, unknown>, args.data)
          return { count: 1 }
        },
      },
      tokenQuotaEvent: {
        findUnique: async (args: { where: { idempotencyKey: string } }) => {
          const row = draft.events.find((item) => item.idempotencyKey === args.where.idempotencyKey)
          return row ? clone(row) : null
        },
        create: async (args: { data: Record<string, unknown> & { idempotencyKey: string } }) => {
          if (draft.events.some((row) => row.idempotencyKey === args.data.idempotencyKey)) throw new Error('duplicate event')
          const row = { ...args.data, id: nextId('event') }
          draft.events.push(row)
          return clone(row)
        },
        upsert: async (args: {
          where: { idempotencyKey: string }
          create: Record<string, unknown> & { idempotencyKey: string }
        }) => {
          const existing = draft.events.find((row) => row.idempotencyKey === args.where.idempotencyKey)
          if (existing) return clone(existing)
          const row = { ...args.create, id: nextId('event') }
          draft.events.push(row)
          return clone(row)
        },
      },
      tokenUsageLedger: {
        findUnique: async (args: { where: { idempotencyKey: string } }) => {
          const row = draft.ledgers.find((item) => item.idempotencyKey === args.where.idempotencyKey)
          return row ? clone(row) : null
        },
        upsert: async (args: {
          where: { idempotencyKey: string }
          create: Record<string, unknown> & { idempotencyKey: string }
        }) => {
          if (failLedgerWrite || failLedgerKey === args.where.idempotencyKey) throw new Error('simulated ledger write failure')
          const existing = draft.ledgers.find((row) => row.idempotencyKey === args.where.idempotencyKey)
          if (existing) return clone(existing)
          const row = { ...args.create, id: nextId('ledger') }
          draft.ledgers.push(row)
          return clone(row)
        },
      },
      generationJob: {
        findUnique: async (args: { where: { id: string } }) => {
          const row = draft.jobs.find((item) => item.id === args.where.id)
          return row ? clone(row) : null
        },
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, Mutation> }) => {
          const row = draft.jobs.find((item) => matchesRow(item as unknown as Record<string, unknown>, args.where))
          if (!row) return { count: 0 }
          applyMutations(row as unknown as Record<string, unknown>, args.data)
          return { count: 1 }
        },
      },
    }
  }

  const prisma = {
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const previous = transactionTail
      let unlock = () => undefined
      transactionTail = new Promise<void>((resolve) => { unlock = resolve })
      await previous
      const draft = clone(state)
      try {
        const result = await work(transactionClient(draft))
        state = draft
        return result
      } finally {
        unlock()
      }
    },
  }

  return {
    prisma,
    snapshot: () => clone(state),
    setLedgerFailure: (value: boolean) => { failLedgerWrite = value },
    setLedgerFailureKey: (value: string | null) => { failLedgerKey = value },
  }
}

function reservationInput(generationId: string, units: bigint) {
  return {
    userId: USER_ID,
    scopeKey: 'MONTHLY:2026-08',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    grantedUnits: 5_000n,
    units,
    generationId,
  }
}

function settlementInput(generationId: string, reservationId: string, quotaId: string, chargedUnits: bigint) {
  return {
    reservationId,
    userId: USER_ID,
    quotaId,
    generationId,
    chargedUnits,
    inputTokens: 120,
    outputTokens: 30,
  }
}

function ledgerInput(generationId: string, quotaId: string, reservedUnits: bigint, chargedUnits: bigint) {
  return {
    userId: USER_ID,
    generationId,
    quotaId,
    model: 'gpt-test',
    provider: 'openai',
    inputTokens: 120,
    outputTokens: 30,
    reservedUnits,
    chargedUnits,
    inputRate: 100,
    outputRate: 300,
    pricingSnapshot: { resolverVersion: 'v2' },
    usageSource: TokenUsageSource.PROVIDER,
    settlementStatus: TokenSettlementStatus.SETTLED,
    type: TokenLedgerType.CHARGE,
    idempotencyKey: `generation:${generationId}:token-charge`,
  }
}

function detailLedgerInput(generationId: string, attemptId: string) {
  return {
    userId: USER_ID,
    generationId,
    quotaId: null,
    model: 'gpt-test',
    provider: 'openai',
    providerAttemptId: attemptId,
    inputTokens: 20,
    outputTokens: 5,
    reservedUnits: 0n,
    chargedUnits: 0n,
    inputRate: 100,
    outputRate: 300,
    pricingSnapshot: { resolverVersion: 'v2', ledgerRole: 'USAGE_DETAIL', attributedChargedUnits: '1' },
    usageSource: TokenUsageSource.PROVIDER,
    settlementStatus: TokenSettlementStatus.SETTLED,
    type: TokenLedgerType.ADJUST,
    idempotencyKey: `generation:${generationId}:aux:${attemptId}`,
  }
}

test('任务 A 释放自己的预留不会影响任务 B 的结算', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)

  const [reservationA, reservationB] = await Promise.all([
    service.reserve(reservationInput('job-a', 1_000n)),
    service.reserve(reservationInput('job-b', 800n)),
  ])
  assert.ok(reservationA)
  assert.ok(reservationB)
  assert.notEqual(reservationA.reservationId, reservationB.reservationId)
  assert.equal(harness.snapshot().quotas[0]?.reservedUnits, 1_800n)

  const released = await service.release({
    userId: USER_ID,
    reservationId: reservationA.reservationId,
    quotaId: reservationA.quotaId,
    generationId: 'job-a',
  })
  assert.equal(released.releasedUnits, 1_000n)
  assert.equal(harness.snapshot().quotas[0]?.reservedUnits, 800n)

  const settled = await service.settleGeneration({
    generationId: 'job-b',
    reservations: [settlementInput('job-b', reservationB.reservationId, reservationB.quotaId, 600n)],
    ledger: ledgerInput('job-b', reservationB.quotaId, 800n, 600n),
  })
  assert.equal(settled.idempotent, false)

  const finalState = harness.snapshot()
  assert.equal(finalState.quotas[0]?.reservedUnits, 0n)
  assert.equal(finalState.quotas[0]?.usedUnits, 600n)
  assert.equal(finalState.quotas[0]?.grantedUnits - finalState.quotas[0]?.usedUnits, 4_400n)
  assert.equal(finalState.reservations.find((row) => row.id === reservationA.reservationId)?.status, TokenQuotaReservationStatus.RELEASED)
  assert.equal(finalState.reservations.find((row) => row.id === reservationB.reservationId)?.status, TokenQuotaReservationStatus.SETTLED)
  assert.equal(finalState.ledgers.length, 1)
})

test('月度和每日预留必须作为完整集合一起结算', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const monthly = await service.reserve(reservationInput('job-b', 900n))
  const daily = await service.reserve({
    ...reservationInput('job-b', 900n),
    scopeKey: 'DAILY:2026-08-30',
  })
  assert.ok(monthly)
  assert.ok(daily)

  await assert.rejects(
    service.settleGeneration({
      generationId: 'job-b',
      reservations: [settlementInput('job-b', monthly.reservationId, monthly.quotaId, 700n)],
      ledger: ledgerInput('job-b', monthly.quotaId, 900n, 700n),
    }),
    (error: unknown) => isConflict(error, '额度结算未覆盖任务的完整计费预留'),
  )

  const state = harness.snapshot()
  assert.equal(state.quotas.length, 2)
  assert.equal(state.quotas.every((quota) => quota.reservedUnits === 900n && quota.usedUnits === 0n), true)
  assert.equal(state.reservations.every((reservation) => reservation.status === TokenQuotaReservationStatus.RESERVED), true)
  assert.equal(state.ledgers.length, 0)
})

test('汇总账本必须关联本次结算中的 quota', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const reservation = await service.reserve(reservationInput('job-b', 900n))
  assert.ok(reservation)

  await assert.rejects(
    service.settleGeneration({
      generationId: 'job-b',
      reservations: [settlementInput('job-b', reservation.reservationId, reservation.quotaId, 700n)],
      ledger: ledgerInput('job-b', 'quota-unrelated', 900n, 700n),
    }),
    (error: unknown) => isConflict(error, '额度结算预留集合或金额不一致'),
  )

  const state = harness.snapshot()
  assert.equal(state.quotas[0]?.reservedUnits, 900n)
  assert.equal(state.quotas[0]?.usedUnits, 0n)
  assert.equal(state.ledgers.length, 0)
})

test('reservationId 不能被其他任务用于释放或结算', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const reservation = await service.reserve(reservationInput('job-a', 1_000n))
  assert.ok(reservation)

  await assert.rejects(
    service.release({
      userId: USER_ID,
      reservationId: reservation.reservationId,
      quotaId: reservation.quotaId,
      generationId: 'job-b',
    }),
    (error: unknown) => isConflict(error, '计费预留归属校验失败'),
  )
  await assert.rejects(
    service.settle(settlementInput('job-b', reservation.reservationId, reservation.quotaId, 700n)),
    (error: unknown) => isConflict(error, '计费预留归属校验失败'),
  )

  const state = harness.snapshot()
  assert.equal(state.quotas[0]?.reservedUnits, 1_000n)
  assert.equal(state.quotas[0]?.usedUnits, 0n)
  assert.equal(state.reservations[0]?.status, TokenQuotaReservationStatus.RESERVED)
  assert.equal(state.events.length, 1)
})

test('重复 release 和 settleGeneration 保持幂等且不重复写事件', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const reservationA = await service.reserve(reservationInput('job-a', 400n))
  const reservationB = await service.reserve(reservationInput('job-b', 900n))
  assert.ok(reservationA)
  assert.ok(reservationB)

  const releaseInput = {
    userId: USER_ID,
    reservationId: reservationA.reservationId,
    quotaId: reservationA.quotaId,
    generationId: 'job-a',
  }
  assert.equal((await service.release(releaseInput)).releasedUnits, 400n)
  assert.equal((await service.release(releaseInput)).releasedUnits, 400n)

  const settleInput = {
    generationId: 'job-b',
    reservations: [settlementInput('job-b', reservationB.reservationId, reservationB.quotaId, 700n)],
    ledger: ledgerInput('job-b', reservationB.quotaId, 900n, 700n),
  }
  assert.equal((await service.settleGeneration(settleInput)).idempotent, false)
  assert.equal((await service.settleGeneration(settleInput)).idempotent, true)

  const state = harness.snapshot()
  assert.equal(state.quotas[0]?.reservedUnits, 0n)
  assert.equal(state.quotas[0]?.usedUnits, 700n)
  assert.equal(state.ledgers.length, 1)
  assert.equal(state.events.length, 5)
  assert.equal(new Set(state.events.map((row) => row.idempotencyKey)).size, state.events.length)
})

test('Ledger 写入失败会回滚 quota、reservation、事件和任务状态', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const reservation = await service.reserve(reservationInput('job-b', 900n))
  assert.ok(reservation)
  harness.setLedgerFailure(true)

  const settleInput = {
    generationId: 'job-b',
    reservations: [settlementInput('job-b', reservation.reservationId, reservation.quotaId, 700n)],
    ledger: ledgerInput('job-b', reservation.quotaId, 900n, 700n),
  }
  await assert.rejects(service.settleGeneration(settleInput), /simulated ledger write failure/)

  const failedState = harness.snapshot()
  assert.equal(failedState.quotas[0]?.reservedUnits, 900n)
  assert.equal(failedState.quotas[0]?.usedUnits, 0n)
  assert.equal(failedState.reservations[0]?.status, TokenQuotaReservationStatus.RESERVED)
  assert.equal(failedState.events.length, 1)
  assert.equal(failedState.ledgers.length, 0)
  assert.equal(failedState.jobs.find((row) => row.id === 'job-b')?.settlementStatus, GenerationSettlementStatus.RESERVED)

  harness.setLedgerFailure(false)
  assert.equal((await service.settleGeneration(settleInput)).idempotent, false)
  const recoveredState = harness.snapshot()
  assert.equal(recoveredState.quotas[0]?.reservedUnits, 0n)
  assert.equal(recoveredState.quotas[0]?.usedUnits, 700n)
  assert.equal(recoveredState.ledgers.length, 1)
  assert.equal(recoveredState.jobs.find((row) => row.id === 'job-b')?.settlementStatus, GenerationSettlementStatus.SETTLED)
})

test('实际用量超出预估时只增量扩充本任务预留且保持幂等', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const reservation = await service.reserve(reservationInput('job-b', 600n))
  assert.ok(reservation)

  const increaseInput = {
    userId: USER_ID,
    generationId: 'job-b',
    reservations: [{ reservationId: reservation.reservationId, quotaId: reservation.quotaId }],
    units: 250n,
    idempotencyKey: 'actual-usage',
  }
  assert.equal((await service.increase(increaseInput)).increasedUnits, 250n)
  assert.equal((await service.increase(increaseInput)).increasedUnits, 250n)

  const increasedState = harness.snapshot()
  assert.equal(increasedState.quotas[0]?.reservedUnits, 850n)
  assert.equal(increasedState.reservations[0]?.reservedUnits, 850n)
  assert.equal(increasedState.events.filter((row) => row.type === 'RESERVE').length, 2)

  await assert.rejects(
    service.increase({ ...increaseInput, units: 251n }),
    (error: unknown) => isConflict(error, '增量预留幂等键对应的金额不一致'),
  )

  await service.settleGeneration({
    generationId: 'job-b',
    reservations: [settlementInput('job-b', reservation.reservationId, reservation.quotaId, 800n)],
    ledger: ledgerInput('job-b', reservation.quotaId, 850n, 800n),
  })
  const settledState = harness.snapshot()
  assert.equal(settledState.quotas[0]?.reservedUnits, 0n)
  assert.equal(settledState.quotas[0]?.usedUnits, 800n)
  assert.equal(settledState.reservations[0]?.chargedUnits, 800n)
})

test('汇总与辅助明细账本原子写入且明细不重复收费', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const reservation = await service.reserve(reservationInput('job-b', 900n))
  assert.ok(reservation)
  const detailLedgers = [detailLedgerInput('job-b', 'attempt-1'), detailLedgerInput('job-b', 'attempt-2')]
  const settleInput = {
    generationId: 'job-b',
    reservations: [settlementInput('job-b', reservation.reservationId, reservation.quotaId, 700n)],
    ledger: ledgerInput('job-b', reservation.quotaId, 900n, 700n),
    detailLedgers,
  }

  assert.equal((await service.settleGeneration(settleInput)).idempotent, false)
  assert.equal((await service.settleGeneration(settleInput)).idempotent, true)
  const state = harness.snapshot()
  assert.equal(state.ledgers.length, 3)
  assert.equal(state.ledgers.reduce((total, row) => total + BigInt(row.chargedUnits as bigint), 0n), 700n)
})

test('辅助明细账本写入失败会回滚整个结算事务', async () => {
  const harness = createPrismaHarness()
  const service = new TokenQuotaService(harness.prisma as never)
  const reservation = await service.reserve(reservationInput('job-b', 900n))
  assert.ok(reservation)
  const detailLedgers = [detailLedgerInput('job-b', 'attempt-1'), detailLedgerInput('job-b', 'attempt-2')]
  harness.setLedgerFailureKey(detailLedgers[1].idempotencyKey)

  await assert.rejects(service.settleGeneration({
    generationId: 'job-b',
    reservations: [settlementInput('job-b', reservation.reservationId, reservation.quotaId, 700n)],
    ledger: ledgerInput('job-b', reservation.quotaId, 900n, 700n),
    detailLedgers,
  }), /simulated ledger write failure/)

  const state = harness.snapshot()
  assert.equal(state.quotas[0]?.reservedUnits, 900n)
  assert.equal(state.quotas[0]?.usedUnits, 0n)
  assert.equal(state.reservations[0]?.status, TokenQuotaReservationStatus.RESERVED)
  assert.equal(state.ledgers.length, 0)
  assert.equal(state.events.length, 1)
  assert.equal(state.jobs.find((row) => row.id === 'job-b')?.settlementStatus, GenerationSettlementStatus.RESERVED)
})
