import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationLifecycleService } from '../../server/src/generations/generation-lifecycle.service'

test('worker claim is conditional and records one running event', async () => {
  const calls: unknown[] = []
  const prisma = {
    generationJob: {
      updateMany: async (input: unknown) => {
        calls.push(input)
        return { count: 1 }
      },
    },
  }
  const events: Array<{ id: string; type: string }> = []
  const lifecycle = new GenerationLifecycleService(prisma as never, {
    append: async (id: string, type: string) => {
      events.push({ id, type })
      return {} as never
    },
  } as never)

  assert.equal(await lifecycle.claim('job-1', 'worker-a', undefined, 60_000), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(events, [{ id: 'job-1', type: 'running' }])
  const claim = calls[0] as { where: { status: string }; data: { lockedBy: string; leaseVersion: { increment: number }; leaseExpiresAt: Date } }
  assert.equal(claim.where.status, 'QUEUED')
  assert.equal(claim.data.lockedBy, 'worker-a')
  assert.deepEqual(claim.data.leaseVersion, { increment: 1 })
  assert.ok(claim.data.leaseExpiresAt instanceof Date)
})

test('losing worker cannot refresh or release another worker lease', async () => {
  const whereClauses: unknown[] = []
  const prisma = {
    generationJob: {
      updateMany: async (input: { where: unknown }) => {
        whereClauses.push(input.where)
        return { count: 0 }
      },
    },
  }
  const lifecycle = new GenerationLifecycleService(prisma as never, { append: async () => ({} as never) } as never)

  const lease = { workerId: 'worker-b', leaseVersion: 2 }
  const heartbeat = await lifecycle.heartbeat('job-1', lease)
  assert.equal(heartbeat.count, 0)
  assert.equal(await lifecycle.releaseForRetry('job-1', lease), false)
  for (const clause of whereClauses as Array<Record<string, unknown>>) {
    assert.equal(clause.id, 'job-1')
    assert.equal(clause.status, 'RUNNING')
    assert.equal(clause.lockedBy, 'worker-b')
    assert.equal(clause.leaseVersion, 2)
    assert.ok(clause.leaseExpiresAt && typeof clause.leaseExpiresAt === 'object')
  }
})

test('worker A cannot finish or fail a job after worker B takes a newer lease', async () => {
  const state = {
    status: 'QUEUED',
    lockedBy: null as string | null,
    leaseVersion: 0,
    leaseExpiresAt: null as Date | null,
  }
  const matches = (where: Record<string, unknown>) => {
    const expiry = where.leaseExpiresAt as { gt?: Date } | undefined
    return where.id === 'job-1'
      && where.status === state.status
      && where.lockedBy === state.lockedBy
      && where.leaseVersion === state.leaseVersion
      && (!expiry?.gt || Boolean(state.leaseExpiresAt && state.leaseExpiresAt > expiry.gt))
  }
  const prisma = {
    generationJob: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (data.leaseVersion && state.status === 'QUEUED') {
          state.status = 'RUNNING'
          state.lockedBy = String(data.lockedBy)
          state.leaseVersion += Number((data.leaseVersion as { increment: number }).increment)
          state.leaseExpiresAt = data.leaseExpiresAt as Date
          return { count: 1 }
        }
        if (!matches(where)) return { count: 0 }
        if (typeof data.status === 'string') state.status = data.status
        state.lockedBy = (data.lockedBy as string | null | undefined) ?? state.lockedBy
        state.leaseExpiresAt = (data.leaseExpiresAt as Date | null | undefined) ?? state.leaseExpiresAt
        return { count: 1 }
      },
    },
  }
  const lifecycle = new GenerationLifecycleService(prisma as never, { append: async () => ({} as never) } as never)

  assert.equal(await lifecycle.claim('job-1', 'worker-a', undefined, 60_000), true)
  const workerA = { workerId: 'worker-a', leaseVersion: state.leaseVersion }

  // Recovery invalidates the expired lease before making the task claimable.
  state.status = 'QUEUED'
  state.lockedBy = null
  state.leaseVersion += 1
  state.leaseExpiresAt = null

  assert.equal(await lifecycle.claim('job-1', 'worker-b', undefined, 60_000), true)
  const workerB = { workerId: 'worker-b', leaseVersion: state.leaseVersion }

  assert.equal(await lifecycle.succeed('job-1', workerA), false)
  assert.equal(await lifecycle.fail('job-1', 'STALE', 'stale worker', undefined, workerA), false)
  assert.equal(state.status, 'RUNNING')
  assert.equal(state.lockedBy, 'worker-b')
  assert.equal(await lifecycle.succeed('job-1', workerB), true)
  assert.equal(state.status, 'SUCCEEDED')
})
