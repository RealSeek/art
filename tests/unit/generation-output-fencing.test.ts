import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationOutputService } from '../../server/src/generations/generation-output.service'

function harness() {
  const state = {
    status: 'RUNNING',
    lockedBy: 'worker-a',
    leaseVersion: 1,
    leaseExpiresAt: new Date(Date.now() + 60_000),
    outputs: [] as Array<{ jobId: string; assetId: string; position: number }>,
  }
  const removed: string[] = []
  let transactionTail: Promise<unknown> = Promise.resolve()

  const matchesLease = (where: Record<string, any>) => state.status === where.status
    && state.lockedBy === where.lockedBy
    && state.leaseVersion === where.leaseVersion
    && state.leaseExpiresAt > where.leaseExpiresAt.gt

  const client = {
    generationJob: {
      findFirst: async ({ where }: { where: Record<string, any> }) => matchesLease(where) ? { id: where.id } : null,
      updateMany: async ({ where }: { where: Record<string, any> }) => ({ count: matchesLease(where) ? 1 : 0 }),
    },
    jobOutput: {
      create: async ({ data }: { data: { jobId: string; assetId: string; position: number } }) => {
        state.outputs.push(data)
        return data
      },
      upsert: async ({ create, update }: { create: { jobId: string; assetId: string; position: number }; update: { position: number } }) => {
        const existing = state.outputs.find((item) => item.jobId === create.jobId && item.assetId === create.assetId)
        if (existing) existing.position = update.position
        else state.outputs.push(create)
        return existing || create
      },
      findMany: async ({ where }: { where: { jobId: string } }) => state.outputs
        .filter((item) => item.jobId === where.jobId)
        .map(({ assetId }) => ({ assetId })),
      deleteMany: async ({ where }: { where: { jobId: string } }) => {
        const before = state.outputs.length
        state.outputs = state.outputs.filter((item) => item.jobId !== where.jobId)
        return { count: before - state.outputs.length }
      },
    },
  }
  const prisma = {
    ...client,
    $transaction: <T>(operation: (tx: typeof client) => Promise<T>) => {
      const queued = transactionTail.then(() => operation(client))
      transactionTail = queued.then(() => undefined, () => undefined)
      return queued
    },
  }
  const assets = {
    storeGenerated: async () => ({ id: 'asset-generated' }),
    remove: async (_userId: string, assetId: string) => { removed.push(assetId) },
  }
  const service = new GenerationOutputService(assets as never, prisma as never)
  const task = {
    id: 'job-1',
    userId: 'user-1',
    projectId: null,
    lockedBy: 'worker-a',
    leaseVersion: 1,
  }
  return { service, state, task, removed }
}

test('a stale worker cannot link an output after another worker owns the lease', async () => {
  const state = harness()
  state.state.lockedBy = 'worker-b'
  state.state.leaseVersion = 2

  await assert.rejects(
    state.service.linkExisting(state.task as never, 'asset-old'),
    /Generation worker lease was lost/,
  )
  assert.deepEqual(state.state.outputs, [])
})

test('storeAndLink removes the newly stored asset when the lease is lost before linking', async () => {
  const state = harness()
  const service = state.service as unknown as {
    assertActiveLease: (task: unknown) => Promise<void>
    storeAndLink: (task: unknown, input: unknown) => Promise<unknown>
  }
  const originalAssert = service.assertActiveLease.bind(service)
  service.assertActiveLease = async (task) => {
    await originalAssert(task)
    state.state.lockedBy = 'worker-b'
    state.state.leaseVersion = 2
  }

  await assert.rejects(service.storeAndLink(state.task, {
    data: new Uint8Array([1]),
    name: 'result.png',
    mimeType: 'image/png',
    kind: 'IMAGE',
  }), /Generation worker lease was lost/)

  assert.deepEqual(state.state.outputs, [])
  assert.deepEqual(state.removed, ['asset-generated'])
})

test('fenced cleanup detaches only while the caller still owns the active lease', async () => {
  const state = harness()
  state.state.outputs.push({ jobId: 'job-1', assetId: 'asset-new-worker', position: 0 })
  state.state.lockedBy = 'worker-b'
  state.state.leaseVersion = 2

  await assert.rejects(
    state.service.cleanup(state.task as never, { requireActiveLease: true }),
    /Generation worker lease was lost/,
  )
  assert.equal(state.state.outputs.length, 1)
  assert.deepEqual(state.removed, [])
})
