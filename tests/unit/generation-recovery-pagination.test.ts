import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationsProcessor } from '../../server/src/generations/generations.processor'

const PAGE_SIZE = 1000

function processor(prisma: object, queue: object, reconciliation: object = {}) {
  return new GenerationsProcessor(
    prisma as never,
    {} as never,
    {} as never,
    { appendRecovery: async () => undefined } as never,
    { kind: 'CHAT', run: async () => undefined } as never,
    { kind: 'IMAGE', run: async () => undefined } as never,
    { kind: 'VIDEO', run: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    reconciliation as never,
    queue as never,
  )
}

test('queued recovery paginates past a full first batch of active BullMQ jobs', async () => {
  const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
    id: `job-${String(index).padStart(4, '0')}`,
    kind: 'CHAT',
    leaseVersion: 1,
    startedAt: null,
  }))
  const calls: Array<Record<string, any>> = []
  const added: string[] = []
  const prisma = {
    generationJob: {
      findMany: async (query: Record<string, any>) => {
        calls.push(query)
        const cursorId = query.cursor?.id
        const start = cursorId ? rows.findIndex((row) => row.id === cursorId) + Number(query.skip || 0) : 0
        return rows.slice(start, start + query.take)
      },
    },
  }
  const queue = {
    getJob: async (id: string) => id === 'job-1000-recovery-1'
      ? undefined
      : { getState: async () => 'active', remove: async () => undefined },
    add: async (_name: string, _data: unknown, options: { jobId: string }) => { added.push(options.jobId) },
  }
  const instance = processor(prisma, queue) as unknown as {
    enqueueQueuedJobs: (excluded?: Set<string>, includeAll?: boolean) => Promise<void>
  }

  await instance.enqueueQueuedJobs()

  assert.equal(calls.length, 2)
  assert.equal(calls[1].cursor.id, 'job-0999')
  assert.equal(calls[1].skip, 1)
  assert.deepEqual(added, ['job-1000-recovery-1'])
})

test('terminal reconciliation paginates past an unrepaired first batch', async () => {
  const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
    id: `terminal-${String(index).padStart(4, '0')}`,
    userId: 'user-1',
    kind: 'CHAT',
    status: 'FAILED',
    settlementStatus: 'RECONCILING',
    conversationId: null,
    options: {},
  }))
  const calls: Array<Record<string, any>> = []
  const reconciled: string[] = []
  const prisma = {
    generationJob: {
      findMany: async (query: Record<string, any>) => {
        calls.push(query)
        const cursorId = query.cursor?.id
        const start = cursorId ? rows.findIndex((row) => row.id === cursorId) + Number(query.skip || 0) : 0
        return rows.slice(start, start + query.take)
      },
      findUnique: async () => null,
    },
    pluginUsage: { updateMany: async () => ({ count: 0 }) },
  }
  const reconciliation = {
    finalizeTerminal: async (id: string) => {
      reconciled.push(id)
      return { settlementStatus: 'RELEASED' }
    },
  }
  const instance = processor(prisma, {}, reconciliation) as unknown as {
    recoverTerminalReservations: () => Promise<void>
  }

  await instance.recoverTerminalReservations()

  assert.equal(calls.length, 2)
  assert.equal(calls[1].cursor.id, 'terminal-0999')
  assert.equal(reconciled.at(-1), 'terminal-1000')
})
