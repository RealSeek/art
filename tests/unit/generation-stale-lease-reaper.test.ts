import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationsProcessor } from '../../server/src/generations/generations.processor'

type AttemptStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED'

function reaperHarness(input: { leaseExpiresAt: Date; attemptStatus?: AttemptStatus }) {
  const task = {
    id: 'job-stale-lease',
    userId: 'user-1',
    kind: 'CHAT' as const,
    status: 'RUNNING',
    settlementStatus: 'RESERVED',
    provider: 'system:OPENAI_COMPATIBLE',
    providerChannelId: null,
    billingTeamId: null,
    model: 'chat-model',
    options: { billing: { quotaEnabled: false } },
    pricingSnapshot: {},
    creditCost: 1,
    revenueMicros: 0,
    upstreamCostMicros: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    conversationId: null,
    lockedBy: 'worker-before-restart' as string | null,
    leaseVersion: 4,
    heartbeatAt: new Date(),
    leaseExpiresAt: input.leaseExpiresAt as Date | null,
    startedAt: new Date(),
    completedAt: null as Date | null,
    createdAt: new Date(Date.now() - 60_000),
    updatedAt: new Date(),
    errorCode: null as string | null,
    errorMessage: null as string | null,
  }
  const attempt = input.attemptStatus
    ? { id: 'attempt-before-restart', status: input.attemptStatus }
    : null
  const queued: Array<{ name: string; data: { jobId: string }; options: { jobId: string } }> = []
  const recoveryEvents: string[] = []
  let providerCalls = 0

  const isStale = (where: Record<string, any>) => {
    const leaseCutoff = where.OR?.[0]?.leaseExpiresAt?.lt as Date | undefined
    const legacyCutoff = where.OR?.[1]?.updatedAt?.lt as Date | undefined
    return task.leaseExpiresAt
      ? Boolean(leaseCutoff && task.leaseExpiresAt.getTime() < leaseCutoff.getTime())
      : Boolean(legacyCutoff && task.updatedAt.getTime() < legacyCutoff.getTime())
  }
  const prisma = {
    generationJob: {
      findMany: async ({ where }: { where: Record<string, any> }) => {
        if (where.status === 'RUNNING') {
          if (task.status !== 'RUNNING' || !isStale(where)) return []
          return [{
            id: task.id,
            kind: task.kind,
            leaseVersion: task.leaseVersion,
            settlementStatus: task.settlementStatus,
            providerAttempts: attempt && ['RUNNING', 'SUCCEEDED'].includes(attempt.status)
              ? [{ id: attempt.id }]
              : [],
          }]
        }
        if (where.status === 'QUEUED') {
          return task.status === 'QUEUED' ? [{ id: task.id, kind: task.kind }] : []
        }
        return []
      },
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
        if (where.id !== task.id || where.status !== task.status) return { count: 0 }
        if (where.leaseVersion !== undefined && where.leaseVersion !== task.leaseVersion) return { count: 0 }
        if (where.OR && !isStale(where)) return { count: 0 }
        if (where.settlementStatus?.in && !where.settlementStatus.in.includes(task.settlementStatus)) return { count: 0 }
        const unresolvedAttempt = Boolean(attempt && ['RUNNING', 'SUCCEEDED'].includes(attempt.status))
        if (where.providerAttempts?.some && !unresolvedAttempt) return { count: 0 }
        const settlementAlternatives = where.AND?.[0]?.OR as Array<Record<string, any>> | undefined
        if (settlementAlternatives) {
          const matchesSettlement = settlementAlternatives.some((condition) => {
            if (!condition.settlementStatus?.in?.includes(task.settlementStatus)) return false
            return condition.providerAttempts?.none ? !unresolvedAttempt : true
          })
          if (!matchesSettlement) return { count: 0 }
        }
        const next = { ...data }
        if (typeof data.leaseVersion === 'object' && data.leaseVersion?.increment) {
          task.leaseVersion += Number(data.leaseVersion.increment)
          delete next.leaseVersion
        }
        Object.assign(task, next)
        return { count: 1 }
      },
      findUniqueOrThrow: async () => ({ ...task }),
      findUnique: async () => ({ ...task }),
    },
    jobOutput: { count: async () => 0 },
  }
  const lifecycle = {
    appendRecovery: async (id: string) => { recoveryEvents.push(id) },
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
      task.completedAt = new Date()
      return true
    },
  }
  const queue = {
    getJob: async () => undefined,
    add: async (name: string, data: { jobId: string }, options: { jobId: string }) => {
      queued.push({ name, data, options })
      return { id: options.jobId }
    },
  }
  const reconciliation = {
    finalizeTerminal: async () => {
      task.settlementStatus = 'RELEASED'
      if (attempt?.status === 'RUNNING') attempt.status = 'FAILED'
      return { ...task }
    },
  }
  const processor = new GenerationsProcessor(
    prisma as never,
    {} as never,
    {} as never,
    lifecycle as never,
    { kind: 'CHAT', run: async () => { providerCalls += 1 } } as never,
    { kind: 'IMAGE', run: async () => undefined } as never,
    { kind: 'VIDEO', run: async () => undefined } as never,
    {} as never,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
    reconciliation as never,
    queue as never,
  )

  return {
    processor,
    task,
    attempt,
    queued,
    recoveryEvents,
    providerCalls: () => providerCalls,
    runRecoveryPass: (now: Date) => (processor as unknown as { runRecoveryPass: (value: Date) => Promise<void> }).runRecoveryPass(now),
  }
}

async function withLongReaperInterval(action: () => Promise<void>) {
  const previous = process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS
  process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS = '3600000'
  try {
    await action()
  } finally {
    if (previous === undefined) delete process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS
    else process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS = previous
  }
}

test('startup recovery does not steal an active generation lease', async () => {
  await withLongReaperInterval(async () => {
    const state = reaperHarness({ leaseExpiresAt: new Date(Date.now() + 60_000) })
    await state.processor.onModuleInit()
    await state.processor.onModuleDestroy()

    assert.equal(state.task.status, 'RUNNING')
    assert.equal(state.task.leaseVersion, 4)
    assert.equal(state.task.lockedBy, 'worker-before-restart')
    assert.deepEqual(state.queued, [])
    assert.deepEqual(state.recoveryEvents, [])
  })
})

test('module shutdown stops the periodic stale-lease scan', async () => {
  const previous = process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS
  process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS = '5000'
  try {
    const state = reaperHarness({ leaseExpiresAt: new Date(Date.now() + 60_000) })
    const internal = state.processor as unknown as { recoveryTimer?: ReturnType<typeof setInterval> }

    await state.processor.onModuleInit()
    assert.ok(internal.recoveryTimer)
    await state.processor.onModuleDestroy()
    assert.equal(internal.recoveryTimer, undefined)
  } finally {
    if (previous === undefined) delete process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS
    else process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS = previous
  }
})

test('non-positive or invalid reaper intervals cannot disable stale-lease recovery', () => {
  const state = reaperHarness({ leaseExpiresAt: new Date(Date.now() + 60_000) })
  const interval = () => (state.processor as unknown as { staleLeaseReaperIntervalMs: () => number }).staleLeaseReaperIntervalMs()
  const previous = process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS
  try {
    for (const value of ['0', '-1', 'invalid']) {
      process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS = value
      assert.equal(interval(), 30_000)
    }
  } finally {
    if (previous === undefined) delete process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS
    else process.env.GENERATION_STALE_LEASE_REAPER_INTERVAL_MS = previous
  }
})

test('a later recovery pass fences and enqueues a lease that expired after restart', async () => {
  await withLongReaperInterval(async () => {
    const state = reaperHarness({ leaseExpiresAt: new Date(Date.now() + 60_000) })
    await state.processor.onModuleInit()

    state.task.leaseExpiresAt = new Date(Date.now() - 1)
    await state.runRecoveryPass(new Date())
    await state.processor.onModuleDestroy()

    assert.equal(state.task.status, 'QUEUED')
    assert.equal(state.task.leaseVersion, 5)
    assert.equal(state.task.lockedBy, null)
    assert.deepEqual(state.recoveryEvents, [state.task.id])
    assert.equal(state.queued.length, 1)
    assert.equal(state.queued[0]?.data.jobId, state.task.id)
    assert.equal(state.queued[0]?.options.jobId, `${state.task.id}-recovery-5`)
  })
})

test('an ambiguous stale ProviderAttempt enters reconciliation and is never replayed', async () => {
  await withLongReaperInterval(async () => {
    const state = reaperHarness({
      leaseExpiresAt: new Date(Date.now() - 60_000),
      attemptStatus: 'RUNNING',
    })
    await state.processor.onModuleInit()

    assert.equal(state.task.status, 'QUEUED')
    assert.equal(state.task.settlementStatus, 'RECONCILING')
    assert.equal(state.task.errorCode, 'SETTLEMENT_RECONCILING')
    assert.equal(state.queued[0]?.options.jobId, `${state.task.id}-recovery-5`)

    const result = await state.processor.process({
      data: { jobId: state.task.id },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never)
    await state.processor.onModuleDestroy()

    assert.equal(result.status, 'FAILED')
    assert.equal(result.settlementStatus, 'RELEASED')
    assert.equal(state.attempt?.status, 'FAILED')
    assert.equal(state.providerCalls(), 0)
  })
})
