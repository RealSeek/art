import assert from 'node:assert/strict'
import test from 'node:test'
import { ProviderAttemptAuditService } from '../../server/src/generations/provider-attempt-audit.service'
import { ReconciliationRequiredError, TerminalSettlementError } from '../../server/src/generations/generation-provider-errors'
import { runWithOutboundSignal } from '../../server/src/common/outbound-http'

const activeLease = { workerId: 'worker-1', leaseVersion: 7 }

function leasedPrisma(overrides: Record<string, unknown>, leaseCount = 1) {
  const prisma: Record<string, unknown> = {
    ...overrides,
    generationJob: {
      updateMany: async () => ({ count: leaseCount }),
      ...((overrides.generationJob as Record<string, unknown> | undefined) || {}),
    },
  }
  prisma.$transaction = async <T>(callback: (tx: typeof prisma) => Promise<T>) => callback(prisma)
  return prisma
}

function withLease<T>(operation: () => Promise<T>) {
  return runWithOutboundSignal(new AbortController().signal, operation, activeLease)
}

test('ProviderAttempt creation is fail-closed', async () => {
  const service = new ProviderAttemptAuditService(leasedPrisma({
    providerAttempt: {
      findMany: async () => [],
      create: async () => { throw new Error('database unavailable') },
    },
  }) as never)

  await assert.rejects(
    withLease(() => service.start({ generationId: 'job-1', provider: 'system:openai', model: 'gpt-test' })),
    (error: unknown) => error instanceof TerminalSettlementError && /创建记录失败/.test(error.message),
  )
})

for (const status of ['RUNNING', 'SUCCEEDED'] as const) {
  test(`an unresolved ${status} primary attempt blocks a second Provider call`, async () => {
    let created = false
    const service = new ProviderAttemptAuditService(leasedPrisma({
      providerAttempt: {
        findMany: async () => [{ id: 'attempt-existing', status, metadata: { auxiliary: false } }],
        create: async () => { created = true },
      },
    }) as never)

    await assert.rejects(
      withLease(() => service.start({ generationId: 'job-1', provider: 'system:openai', model: 'gpt-test', metadata: { auxiliary: false } })),
      (error: unknown) => error instanceof ReconciliationRequiredError && /必须先对账/.test(error.message),
    )
    assert.equal(created, false)
  })
}

test('a successful auxiliary attempt does not block the primary Provider attempt', async () => {
  let created = false
  const service = new ProviderAttemptAuditService(leasedPrisma({
    providerAttempt: {
      findMany: async () => [{ id: 'attempt-aux', status: 'SUCCEEDED', metadata: { auxiliary: true } }],
      create: async () => { created = true; return { id: 'attempt-primary' } },
    },
  }) as never)

  const result = await withLease(() => service.start({ generationId: 'job-1', provider: 'system:openai', model: 'gpt-test', metadata: { auxiliary: false } }))
  assert.equal(result.id, 'attempt-primary')
  assert.equal(created, true)
})

test('ProviderAttempt terminal transition requires the owned RUNNING row', async () => {
  let update: Record<string, unknown> | undefined
  const service = new ProviderAttemptAuditService(leasedPrisma({
    providerAttempt: {
      updateMany: async (input: Record<string, unknown>) => { update = input; return { count: 1 } },
    },
  }) as never)

  await withLease(() => service.succeed({ id: 'attempt-1', generationId: 'job-1', metadata: { latencyMs: 42 } }))
  assert.deepEqual(update?.where, { id: 'attempt-1', generationId: 'job-1', status: 'RUNNING' })
  assert.equal((update?.data as Record<string, unknown>).status, 'SUCCEEDED')
})

test('ProviderAttempt transition conflict blocks further processing', async () => {
  const service = new ProviderAttemptAuditService(leasedPrisma({
    providerAttempt: {
      updateMany: async () => ({ count: 0 }),
    },
  }) as never)

  await assert.rejects(
    withLease(() => service.fail({ id: 'attempt-1', generationId: 'job-1', errorCode: 'HTTP_500', errorMessage: 'failed' })),
    (error: unknown) => error instanceof TerminalSettlementError && /并发变化/.test(error.message),
  )
})

test('ProviderAttempt operations fail closed without a worker lease context', async () => {
  let queried = false
  const service = new ProviderAttemptAuditService(leasedPrisma({
    providerAttempt: {
      findMany: async () => { queried = true; return [] },
      create: async () => ({ id: 'attempt-1' }),
    },
  }) as never)

  await assert.rejects(
    service.start({ generationId: 'job-1', provider: 'system:openai', model: 'gpt-test' }),
    (error: unknown) => error instanceof TerminalSettlementError && /lease context is missing/.test(error.message),
  )
  assert.equal(queried, false)
})

test('stale worker lease rejects post-success persistence before the operation runs', async () => {
  let persisted = false
  const service = new ProviderAttemptAuditService(leasedPrisma({}, 0) as never)

  await assert.rejects(
    withLease(() => service.withActiveLease('job-1', async () => { persisted = true })),
    (error: unknown) => error instanceof ReconciliationRequiredError && /lease was lost/.test(error.message),
  )
  assert.equal(persisted, false)
})
