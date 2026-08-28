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
  const claim = calls[0] as { where: { status: string }; data: { lockedBy: string; leaseExpiresAt: Date } }
  assert.equal(claim.where.status, 'QUEUED')
  assert.equal(claim.data.lockedBy, 'worker-a')
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

  const heartbeat = await lifecycle.heartbeat('job-1', 'worker-b')
  assert.equal(heartbeat.count, 0)
  assert.equal(await lifecycle.releaseForRetry('job-1', 'worker-b'), false)
  assert.deepEqual(whereClauses, [
    { id: 'job-1', status: 'RUNNING', lockedBy: 'worker-b' },
    { id: 'job-1', status: 'RUNNING', lockedBy: 'worker-b' },
  ])
})
