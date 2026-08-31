import assert from 'node:assert/strict'
import test from 'node:test'
import { runWithOutboundSignal } from '../../server/src/common/outbound-http'
import { GenerationLifecycleService } from '../../server/src/generations/generation-lifecycle.service'
import { TerminalSettlementError } from '../../server/src/generations/generation-provider-errors'
import { ProviderAttemptAuditService } from '../../server/src/generations/provider-attempt-audit.service'
import { GenerationsService } from '../../server/src/generations/generations.service'

type Attempt = {
  id: string
  generationId: string
  provider: string
  model: string
  status: string
  startedAt: Date
  metadata?: unknown
}

function serialHarness() {
  const attempts: Attempt[] = []
  const job: Record<string, any> = {
    id: 'job-race',
    userId: 'user-1',
    kind: 'CHAT',
    status: 'RUNNING',
    settlementStatus: 'RESERVED',
    prompt: 'hello',
    model: 'gpt-test',
    provider: 'system:openai',
    providerChannelId: null,
    conversationId: null,
    billingTeamId: null,
    options: {},
    errorCode: null,
    errorMessage: null,
    lockedBy: 'worker-1',
    leaseVersion: 7,
    leaseExpiresAt: new Date(Date.now() + 60_000),
    heartbeatAt: new Date(),
    outputs: [],
    events: [],
    billingTransactions: [],
    usageRecords: [],
  }
  let transactionTail: Promise<unknown> = Promise.resolve()

  const matches = (where: Record<string, any>) => {
    for (const [key, expected] of Object.entries(where)) {
      const actual = job[key]
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if (Array.isArray(expected.in) && !expected.in.includes(actual)) return false
        if (expected.gt instanceof Date && (!(actual instanceof Date) || actual <= expected.gt)) return false
        continue
      }
      if (actual !== expected) return false
    }
    return true
  }
  const applyData = (data: Record<string, any>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && typeof value.increment === 'number') {
        job[key] = Number(job[key] || 0) + value.increment
      } else {
        job[key] = value
      }
    }
  }
  const snapshot = () => ({ ...job, providerAttempts: attempts.map((attempt) => ({ ...attempt })) })
  const prisma: Record<string, any> = {
    generationJob: {
      updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
        if (!matches(where)) return { count: 0 }
        applyData(data)
        return { count: 1 }
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => where.id === job.id && where.userId === job.userId ? snapshot() : null,
      findUniqueOrThrow: async () => snapshot(),
    },
    providerAttempt: {
      findMany: async ({ where }: { where: Record<string, any> }) => attempts.filter((attempt) => attempt.generationId === where.generationId && where.status.in.includes(attempt.status)),
      findFirst: async ({ where }: { where: Record<string, any> }) => attempts.find((attempt) => attempt.generationId === where.generationId && where.status.in.includes(attempt.status)) || null,
      create: async ({ data }: { data: Omit<Attempt, 'id' | 'startedAt'> }) => {
        const attempt = { ...data, id: `attempt-${attempts.length + 1}`, startedAt: new Date() } as Attempt
        attempts.push(attempt)
        return { ...attempt }
      },
    },
    pluginUsage: { updateMany: async () => ({ count: 0 }) },
  }
  prisma.$transaction = <T>(callback: (tx: typeof prisma) => Promise<T>) => {
    const queued = transactionTail.then(() => callback(prisma))
    transactionTail = queued.then(() => undefined, () => undefined)
    return queued
  }
  return { prisma, job, attempts }
}

function lifecycle(prisma: object) {
  return new GenerationLifecycleService(prisma as never, { append: async () => undefined } as never)
}

test('cancellation winning the GenerationJob lock prevents a late ProviderAttempt start', async () => {
  const { prisma, attempts } = serialHarness()
  const cancellation = lifecycle(prisma).cancel('job-race', 'user-1')
  const audit = new ProviderAttemptAuditService(prisma as never)
  const lateStart = runWithOutboundSignal(
    new AbortController().signal,
    () => audit.start({ generationId: 'job-race', provider: 'system:openai', model: 'gpt-test', metadata: { auxiliary: false } }),
    { workerId: 'worker-1', leaseVersion: 7 },
  )

  assert.equal(await cancellation, true)
  await assert.rejects(lateStart, (error: unknown) => error instanceof TerminalSettlementError && /lease was lost/.test(error.message))
  assert.equal(attempts.length, 0)
})

test('ProviderAttempt winning the lock makes cancellation reconcile without refund or release', async () => {
  const { prisma, job } = serialHarness()
  const generationLifecycle = lifecycle(prisma)
  const audit = new ProviderAttemptAuditService(prisma as never)
  const calls = { refunds: 0, releases: 0, queueRemovals: 0 }
  await runWithOutboundSignal(
    new AbortController().signal,
    () => audit.start({ generationId: 'job-race', provider: 'system:openai', model: 'gpt-test', metadata: { auxiliary: false } }),
    { workerId: 'worker-1', leaseVersion: 7 },
  )

  const service = new GenerationsService(
    prisma as never,
    { refundOutstandingGeneration: async () => { calls.refunds += 1; return { amount: 1 } } } as never,
    { recordRefund: async () => undefined, safely: async (operation: Promise<unknown>) => operation } as never,
    {} as never,
    { cancelLocalWorkerTask: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    generationLifecycle,
    {} as never,
    {} as never,
    {
      reservationsForGeneration: async () => { calls.releases += 1; return [] },
      release: async () => { calls.releases += 1 },
    } as never,
    {} as never,
    { finalizeTerminal: async () => job } as never,
    { getJob: async () => ({ isActive: async () => false, remove: async () => { calls.queueRemovals += 1 } }) } as never,
  )

  const result = await service.cancel('user-1', 'job-race')

  assert.equal(job.status, 'CANCELLED')
  assert.equal(job.settlementStatus, 'RECONCILING')
  assert.equal('settlementStatus' in result, false)
  assert.deepEqual(calls, { refunds: 0, releases: 0, queueRemovals: 0 })
})
