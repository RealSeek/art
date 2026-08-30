import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationsProcessor } from '../../server/src/generations/generations.processor'
import { TerminalSettlementError } from '../../server/src/generations/generation-provider-errors'

type Reservation = {
  reservationId: string
  quotaId: string
  userId: string
  generationId: string
  reservedUnits: bigint
  chargedUnits: bigint
  status: 'RESERVED' | 'RELEASED' | 'SETTLED'
  scopeKey: string
}

function taskWithBilling(billing: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  return {
    id: 'job-recovery',
    userId: 'user-1',
    status: 'RUNNING',
    settlementStatus: 'PENDING',
    options: { billing },
    pricingSnapshot: {},
    ...extras,
  }
}

function processorHarness(reservations: Reservation[]) {
  const released: Array<Record<string, unknown>> = []
  let updateInput: Record<string, unknown> | undefined
  const task = taskWithBilling({
    quotaEnabled: true,
    expectedReservationCount: 2,
    expectedReservationScopes: ['MONTHLY:sub-1', 'DAILY:sub-1:2026-08-30'],
    expectedReservationUnits: '100',
  })
  const prisma = {
    generationJob: {
      updateMany: async (input: Record<string, unknown>) => { updateInput = input; return { count: 1 } },
      findUniqueOrThrow: async () => ({ ...task, settlementStatus: 'RESERVED', options: updateInput?.data && typeof updateInput.data === 'object' ? (updateInput.data as Record<string, unknown>).options : task.options }),
    },
    providerAttempt: { findFirst: async () => null },
  }
  Object.assign(prisma, { $transaction: async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma) })
  const tokenQuota = {
    reservationsForGeneration: async () => reservations,
    release: async (input: Record<string, unknown>) => { released.push(input); return { releasedUnits: 100n } },
  }
  const noop = {}
  const chatRunner = { kind: 'CHAT' as const, run: async () => undefined }
  const imageRunner = { kind: 'IMAGE' as const, run: async () => undefined }
  const videoRunner = { kind: 'VIDEO' as const, run: async () => undefined }
  const processor = new GenerationsProcessor(
    prisma as never,
    noop as never,
    noop as never,
    noop as never,
    chatRunner as never,
    imageRunner as never,
    videoRunner as never,
    noop as never,
    noop as never,
    tokenQuota as never,
    noop as never,
    noop as never,
  )
  return { processor, task, released, getUpdate: () => updateInput }
}

function reservation(id: string, quotaId: string, scopeKey: string, status: Reservation['status'] = 'RESERVED', reservedUnits = 100n): Reservation {
  return {
    reservationId: id,
    quotaId,
    userId: 'user-1',
    generationId: 'job-recovery',
    reservedUnits,
    chargedUnits: 0n,
    status,
    scopeKey,
  }
}

test('complete reservations recover missing options before provider execution', async () => {
  const { processor, task, getUpdate } = processorHarness([
    reservation('reservation-monthly', 'quota-monthly', 'MONTHLY:sub-1'),
    reservation('reservation-daily', 'quota-daily', 'DAILY:sub-1:2026-08-30'),
  ])
  const recovery = processor as unknown as { recoverTokenReservations: (value: object) => Promise<Record<string, unknown>> }

  const recovered = await recovery.recoverTokenReservations(task)
  const billing = ((recovered.options as Record<string, unknown>).billing) as Record<string, unknown>
  assert.deepEqual(billing.quotaReservations, [
    { reservationId: 'reservation-monthly', quotaId: 'quota-monthly', reservedUnits: '100' },
    { reservationId: 'reservation-daily', quotaId: 'quota-daily', reservedUnits: '100' },
  ])
  assert.equal(billing.quotaId, 'quota-monthly')
  assert.equal(recovered.settlementStatus, 'RESERVED')
  assert.equal(((getUpdate()?.data as Record<string, unknown>).options as Record<string, unknown>).billing !== undefined, true)
})

test('partial reservations are released and blocked before a provider can run', async () => {
  const { processor, task, released } = processorHarness([
    reservation('reservation-monthly', 'quota-monthly', 'MONTHLY:sub-1'),
  ])
  const recovery = processor as unknown as { recoverTokenReservations: (value: object) => Promise<Record<string, unknown>> }

  await assert.rejects(
    recovery.recoverTokenReservations(task),
    (error: unknown) => error instanceof TerminalSettlementError && /已阻止 Provider 调用/.test(error.message),
  )
  assert.deepEqual(released.map((input) => input.reservationId), ['reservation-monthly'])
})

test('release falls back to database reservations when job options lost the reservation id', async () => {
  const { processor, released } = processorHarness([
    reservation('reservation-monthly', 'quota-monthly', 'MONTHLY:sub-1'),
    reservation('reservation-daily', 'quota-daily', 'DAILY:sub-1:2026-08-30'),
  ])
  const recovery = processor as unknown as { releaseTokenReservation: (value: object) => Promise<boolean> }

  const result = await recovery.releaseTokenReservation(taskWithBilling({ quotaEnabled: true, expectedReservationCount: 2, expectedReservationUnits: '100' }))
  assert.equal(result, true)
  assert.deepEqual(new Set(released.map((input) => input.reservationId)), new Set(['reservation-monthly', 'reservation-daily']))
})

test('reservation lookup failure does not claim that release succeeded', async () => {
  const { processor } = processorHarness([])
  const tokenQuota = (processor as unknown as { tokenQuota: { reservationsForGeneration: () => Promise<never>; release: () => Promise<unknown> } }).tokenQuota
  tokenQuota.reservationsForGeneration = async () => { throw new Error('database unavailable') }
  const recovery = processor as unknown as { releaseTokenReservation: (value: object) => Promise<boolean> }

  const result = await recovery.releaseTokenReservation(taskWithBilling({ quotaEnabled: true, quotaId: 'quota-monthly' }))
  assert.equal(result, false)
})

test('startup recovery releases reservations left on terminal jobs after a process crash', async () => {
  const { processor, released } = processorHarness([
    reservation('reservation-monthly', 'quota-monthly', 'MONTHLY:sub-1'),
    reservation('reservation-daily', 'quota-daily', 'DAILY:sub-1:2026-08-30'),
  ])
  const internal = processor as unknown as {
    prisma: {
      generationJob: {
        findMany: () => Promise<Array<Record<string, unknown>>>
        updateMany: (input: Record<string, unknown>) => Promise<{ count: number }>
      }
    }
    recoverTerminalReservations: () => Promise<void>
  }
  let terminalUpdate: Record<string, unknown> | undefined
  internal.prisma.generationJob.findMany = async () => [{
    id: 'job-recovery',
    userId: 'user-1',
    status: 'FAILED',
    options: { billing: { quotaEnabled: true } },
  }]
  internal.prisma.generationJob.updateMany = async (input) => {
    terminalUpdate = input
    return { count: 1 }
  }

  await internal.recoverTerminalReservations()

  assert.deepEqual(new Set(released.map((input) => input.reservationId)), new Set(['reservation-monthly', 'reservation-daily']))
  assert.equal((terminalUpdate?.data as Record<string, unknown>).settlementStatus, 'RELEASED')
  assert.deepEqual((terminalUpdate?.where as Record<string, unknown>).settlementStatus, {
    in: ['PENDING', 'RESERVED'],
  })
})

for (const status of ['RUNNING', 'SUCCEEDED'] as const) {
  test(`startup recovery preserves reservations when a terminal job has a ${status} ProviderAttempt`, async () => {
    const { processor, released } = processorHarness([
      reservation('reservation-monthly', 'quota-monthly', 'MONTHLY:sub-1'),
      reservation('reservation-daily', 'quota-daily', 'DAILY:sub-1:2026-08-30'),
    ])
    const internal = processor as unknown as {
      prisma: {
        generationJob: {
          findMany: () => Promise<Array<Record<string, unknown>>>
          updateMany: (input: Record<string, unknown>) => Promise<{ count: number }>
        }
        providerAttempt: { findFirst: () => Promise<Record<string, unknown> | null> }
      }
      recoverTerminalReservations: () => Promise<void>
    }
    const updates: Array<Record<string, unknown>> = []
    internal.prisma.generationJob.findMany = async () => [{
      id: 'job-recovery',
      userId: 'user-1',
      status: 'CANCELLED',
      settlementStatus: 'RESERVED',
      options: { billing: { quotaEnabled: true } },
    }]
    internal.prisma.generationJob.updateMany = async (input) => {
      updates.push(input)
      return { count: 1 }
    }
    internal.prisma.providerAttempt.findFirst = async () => ({ id: 'attempt-unresolved', status })

    await internal.recoverTerminalReservations()

    assert.equal(released.length, 0)
    assert.equal((updates.at(-1)?.data as Record<string, unknown>).settlementStatus, 'RECONCILING')
  })
}

test('fresh PENDING jobs wait for the creator instead of releasing a partial hold', async () => {
  const { processor, task, released } = processorHarness([
    reservation('reservation-monthly', 'quota-monthly', 'MONTHLY:sub-1'),
  ])
  const recovery = processor as unknown as { recoverTokenReservations: (value: object) => Promise<Record<string, unknown>> }
  const freshTask = { ...task, createdAt: new Date() }

  await assert.rejects(
    recovery.recoverTokenReservations(freshTask),
    (error: unknown) => error instanceof Error && !(error instanceof TerminalSettlementError) && /仍在创建中/.test(error.message),
  )
  assert.equal(released.length, 0)
})

test('RECONCILING jobs are never sent back to a provider', async () => {
  const { processor, task } = processorHarness([])
  const recovery = processor as unknown as { recoverTokenReservations: (value: object) => Promise<Record<string, unknown>> }

  await assert.rejects(
    recovery.recoverTokenReservations({ ...task, settlementStatus: 'RECONCILING' }),
    (error: unknown) => error instanceof TerminalSettlementError && /阻止重复调用 Provider/.test(error.message),
  )
})

test('non-quota PENDING jobs cannot execute without completed preauthorization', async () => {
  const { processor, task } = processorHarness([])
  const recovery = processor as unknown as { recoverTokenReservations: (value: object) => Promise<Record<string, unknown>> }

  await assert.rejects(
    recovery.recoverTokenReservations(taskWithBilling({ quotaEnabled: false }, { createdAt: new Date(0) })),
    (error: unknown) => error instanceof TerminalSettlementError && /预授权未完成/.test(error.message),
  )
})
