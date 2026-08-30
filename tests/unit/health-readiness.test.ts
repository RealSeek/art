import assert from 'node:assert/strict'
import test from 'node:test'
import { ReadinessService } from '../../server/src/common/readiness.service'

function service(options: { database?: boolean; redis?: boolean; bullmq?: boolean } = {}) {
  const prisma = {
    $queryRaw: async () => {
      if (options.database === false) throw new Error('database unavailable')
      return [{ ok: 1 }]
    },
  }
  const queue = {
    client: Promise.resolve({
      ping: async () => {
        if (options.redis === false) throw new Error('redis unavailable')
        return 'PONG'
      },
    }),
    getJobCounts: async () => {
      if (options.bullmq === false) throw new Error('queue unavailable')
      return { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 }
    },
  }
  return new ReadinessService(prisma as never, queue as never)
}

test('readiness succeeds only when database, Redis, and BullMQ respond', async () => {
  const result = await service().check()
  assert.equal(result.ok, true)
  assert.equal(result.dependencies.database.status, 'up')
  assert.equal(result.dependencies.redis.status, 'up')
  assert.equal(result.dependencies.bullmq.status, 'up')
})

test('readiness fails closed and identifies unavailable dependencies', async () => {
  const result = await service({ redis: false, bullmq: false }).check()
  assert.equal(result.ok, false)
  assert.equal(result.dependencies.database.status, 'up')
  assert.equal(result.dependencies.redis.status, 'down')
  assert.equal(result.dependencies.bullmq.status, 'down')
})
