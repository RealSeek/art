import assert from 'node:assert/strict'
import test from 'node:test'
import { PricingResolverService } from '../../server/src/billing/pricing-resolver.service'
import { ProviderRequestError, ReconciliationRequiredError, TerminalSettlementError } from '../../server/src/generations/generation-provider-errors'
import { ProviderAttemptAuditService } from '../../server/src/generations/provider-attempt-audit.service'
import { ChatGenerationRunner } from '../../server/src/generations/runners/chat-generation.runner'
import { ProjectSkillsService } from '../../server/src/projects/project-skills.service'
import { runWithOutboundSignal } from '../../server/src/common/outbound-http'

function auxiliaryRunner(
  prisma: object,
  providers: object,
  tokenQuota: object = {},
  attemptAudit?: object,
) {
  const tx = {
    ...prisma,
    userApiCredential: (prisma as { userApiCredential?: object }).userApiCredential || {
      updateMany: async (input: Record<string, unknown>) => {
        const where = input.where as { id?: string }
        const data = input.data as { inputTokens?: { increment?: bigint }; outputTokens?: { increment?: bigint } }
        const record = (providers as { recordCredentialUsage?: (id: string | undefined, input: number, output: number) => Promise<unknown> }).recordCredentialUsage
        if (record) await record(where.id, Number(data.inputTokens?.increment || 0n), Number(data.outputTokens?.increment || 0n))
        return { count: 1 }
      },
    },
  }
  const provided = attemptAudit as {
    start?: (...args: never[]) => Promise<unknown>
    succeed?: (...args: never[]) => Promise<unknown>
    fail?: (...args: never[]) => Promise<unknown>
    withActiveLease?: (...args: never[]) => Promise<unknown>
  } | undefined
  const audit = {
    start: provided?.start ? provided.start.bind(provided) : async () => ({ id: 'attempt-primary' }),
    succeed: provided?.succeed ? provided.succeed.bind(provided) : async () => undefined,
    fail: provided?.fail ? provided.fail.bind(provided) : async () => undefined,
    withActiveLease: provided?.withActiveLease
      ? provided.withActiveLease.bind(provided)
      : async (_generationId: string, operation: (client: object) => Promise<unknown>) => operation(tx),
  }
  return new ChatGenerationRunner(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    providers as never,
    {} as never,
    new PricingResolverService(),
    {} as never,
    tokenQuota as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    audit as never,
  )
}

const activeLease = { workerId: 'worker-1', leaseVersion: 7 }
const withLease = <T>(operation: () => Promise<T>) => runWithOutboundSignal(new AbortController().signal, operation, activeLease)

const resolvedProvider = {
  source: 'system',
  type: 'openai',
  model: 'gpt-test',
  providerId: 'provider-1',
  routeId: 'route-1',
  credentialId: 'credential-1',
  presetKey: 'test',
  inputCreditsPerMillion: 100,
  outputCreditsPerMillion: 300,
  baseInputCreditsPerMillion: 100,
  baseOutputCreditsPerMillion: 300,
  creditRatePercent: 100,
  inputCostMicrosPerMillion: 50,
  outputCostMicrosPerMillion: 150,
  creditValueMicros: 1,
  pricingUsdExchangeRateMicros: 1_000_000,
}

test('project skill summarization uses the billable generation pipeline', async () => {
  let generationInput: Record<string, unknown> | undefined
  const prisma = {
    project: {
      findFirst: async () => ({ id: 'project-1', userId: 'user-1', defaultModel: 'model-1', activeSkillVersionId: null, activeSkillVersion: null, members: [], team: null }),
    },
    message: {
      findMany: async () => [{ role: 'USER', content: 'Keep answers concise.' }],
    },
    conversation: {
      findFirst: async () => ({ id: 'source-conversation', title: 'Source conversation' }),
      create: async () => ({ id: 'internal-conversation' }),
      delete: async () => undefined,
    },
  }
  const generations = {
    create: async (_userId: string, input: Record<string, unknown>) => {
      generationInput = input
      return { id: 'generation-1' }
    },
    get: async () => ({ status: 'SUCCEEDED', stream: { content: '{"name":"Concise","content":"Use concise answers.","changeSummary":"Added concise style"}' } }),
    cancel: async () => undefined,
  }
  const access = { projectWhere: () => ({}) }
  const service = new ProjectSkillsService(prisma as never, generations as never, access as never)

  const result = await service.summarize('user-1', 'project-1', 'source-conversation')

  assert.equal(result.name, 'Concise')
  assert.equal(generationInput?.kind, 'CHAT')
  assert.equal(generationInput?.conversationId, 'internal-conversation')
  assert.equal((generationInput?.options as Record<string, unknown>).internalPurpose, 'project-skill-summary')
})

test('auxiliary provider call establishes its attempt before execution and returns an auditable trace', async () => {
  const order: string[] = []
  let attemptUpdate: Record<string, unknown> | undefined
  let ledgerUpsert: Record<string, unknown> | undefined
  let trace: Record<string, unknown> | undefined
  const prisma = {
    providerAttempt: {
      create: async () => { order.push('attempt:create'); return { id: 'attempt-1' } },
      update: async (input: Record<string, unknown>) => { order.push('attempt:update'); attemptUpdate = input; return { id: 'attempt-1' } },
    },
    tokenUsageLedger: {
      upsert: async (input: Record<string, unknown>) => { order.push('ledger:upsert'); ledgerUpsert = input; return { id: 'ledger-1' } },
    },
  }
  const providers = {
    recordCredentialUsage: async () => { order.push('credential:usage') },
  }
  const runner = auxiliaryRunner(prisma, providers) as unknown as {
    trackAuxiliaryProviderCall: (
      task: object,
      resolved: object,
      purpose: 'web_search_planning',
      round: number | undefined,
      execute: () => Promise<object>,
      onTrace: (value: Record<string, unknown>) => void,
    ) => Promise<object>
  }

  await runner.trackAuxiliaryProviderCall(
    { id: 'job-1', userId: 'user-1', options: { billing: { billingSource: 'SUBSCRIPTION_QUOTA' } } },
    resolvedProvider,
    'web_search_planning',
    undefined,
    async () => {
      order.push('provider:execute')
      return {
        usage: { prompt_tokens: 1_000, completion_tokens: 500, cached_input_tokens: 20, reasoning_tokens: 10 },
        usageSource: 'PROVIDER' as never,
        estimatedUsageFields: [],
        providerRequestId: 'request-1',
      }
    },
    (value) => { trace = value },
  )

  assert.deepEqual(order, ['attempt:create', 'provider:execute', 'attempt:update', 'ledger:upsert', 'credential:usage'])
  assert.equal((attemptUpdate?.where as Record<string, unknown>).id, 'attempt-1')
  const ledger = ledgerUpsert?.create as Record<string, unknown>
  assert.equal(ledger.idempotencyKey, 'job:job-1:token-ledger:aux:attempt-1')
  assert.equal(ledger.chargedUnits, 0n)
  assert.equal(ledger.reservedUnits, 0n)
  assert.equal((ledger.pricingSnapshot as Record<string, unknown>).financialImpact, 'NONE')
  assert.equal((ledger.pricingSnapshot as Record<string, unknown>).callStatus, 'SUCCEEDED')
  assert.equal(trace?.providerAttemptId, 'attempt-1')
  assert.equal(trace?.providerRequestId, 'request-1')
  assert.equal(trace?.chargedUnits, 1n)
  assert.equal(trace?.status, 'SUCCEEDED')
})

test('auxiliary provider execution fails closed when its audit attempt cannot be created', async () => {
  let executed = false
  const runner = auxiliaryRunner({
    providerAttempt: {
      create: async () => { throw new Error('database unavailable') },
    },
  }, { recordCredentialUsage: async () => undefined }) as unknown as {
    trackAuxiliaryProviderCall: (
      task: object,
      resolved: object,
      purpose: 'web_search_planning',
      round: number | undefined,
      execute: () => Promise<object>,
    ) => Promise<object>
  }

  await assert.rejects(
    runner.trackAuxiliaryProviderCall(
      { id: 'job-1', options: {} },
      resolvedProvider,
      'web_search_planning',
      undefined,
      async () => { executed = true; return {} },
    ),
    /辅助模型调用审计初始化失败/,
  )
  assert.equal(executed, false)
})

test('BYOK_FREE and PLATFORM auxiliary calls keep provider cost but charge zero user units', async () => {
  for (const billingSource of ['BYOK_FREE', 'PLATFORM']) {
    let trace: Record<string, unknown> | undefined
    const runner = auxiliaryRunner({
      providerAttempt: {
        create: async () => ({ id: `attempt-${billingSource}` }),
        update: async () => ({ id: `attempt-${billingSource}` }),
      },
      tokenUsageLedger: { upsert: async () => ({ id: `ledger-${billingSource}` }) },
    }, { recordCredentialUsage: async () => undefined }) as unknown as {
      trackAuxiliaryProviderCall: (
        task: object,
        resolved: object,
        purpose: 'web_search_planning',
        round: number | undefined,
        execute: () => Promise<object>,
        onTrace: (value: Record<string, unknown>) => void,
      ) => Promise<object>
    }

    await runner.trackAuxiliaryProviderCall(
      { id: `job-${billingSource}`, userId: 'user-1', options: { billing: { billingSource } } },
      resolvedProvider,
      'web_search_planning',
      undefined,
      async () => ({ usage: { prompt_tokens: 10_000, completion_tokens: 2_000 }, usageSource: 'PROVIDER' }),
      (value) => { trace = value },
    )

    assert.equal(trace?.chargedUnits, 0n)
    assert.ok(Number(trace?.upstreamCostMicros) > 0)
    assert.equal((trace?.pricingSnapshot as Record<string, unknown>).inputRate, 0)
    assert.equal((trace?.pricingSnapshot as Record<string, unknown>).outputRate, 0)
  }
})

test('quota-backed auxiliary call increases its own reservation before provider execution', async () => {
  const order: string[] = []
  const attemptUpdates: Array<Record<string, unknown>> = []
  let increaseInput: Record<string, unknown> | undefined
  let trace: Record<string, unknown> | undefined
  const runner = auxiliaryRunner({
    providerAttempt: {
      create: async () => { order.push('attempt:create'); return { id: 'attempt-reserved' } },
      update: async (input: Record<string, unknown>) => { order.push('attempt:update'); attemptUpdates.push(input); return { id: 'attempt-reserved' } },
    },
    tokenUsageLedger: {
      upsert: async () => { order.push('ledger:upsert'); return { id: 'ledger-reserved' } },
    },
  }, {
    recordCredentialUsage: async () => { order.push('credential:usage') },
  }, {
    increase: async (input: Record<string, unknown>) => { order.push('quota:increase'); increaseInput = input; return { increasedUnits: 1n } },
  }) as unknown as {
    trackAuxiliaryProviderCall: (
      task: object,
      resolved: object,
      purpose: 'web_search_planning',
      round: number | undefined,
      execute: () => Promise<object>,
      onTrace: (value: Record<string, unknown>) => void,
      reservationEstimate: { inputTokens: number; outputTokens: number },
    ) => Promise<object>
  }

  await runner.trackAuxiliaryProviderCall(
    {
      id: 'job-reserved',
      userId: 'user-1',
      options: {
        billing: {
          billingSource: 'SUBSCRIPTION_QUOTA',
          quotaEnabled: true,
          quotaId: 'quota-1',
          quotaReservations: [{ reservationId: 'reservation-1', quotaId: 'quota-1', reservedUnits: '10' }],
        },
      },
    },
    resolvedProvider,
    'web_search_planning',
    undefined,
    async () => { order.push('provider:execute'); return { usage: { prompt_tokens: 1_000, completion_tokens: 500 }, usageSource: 'PROVIDER' } },
    (value) => { trace = value },
    { inputTokens: 1_000, outputTokens: 500 },
  )

  assert.deepEqual(order, ['attempt:create', 'quota:increase', 'attempt:update', 'provider:execute', 'attempt:update', 'ledger:upsert', 'credential:usage'])
  assert.equal(increaseInput?.idempotencyKey, 'aux:attempt-reserved')
  assert.equal(increaseInput?.units, 1n)
  const preauthData = attemptUpdates[0]?.data as Record<string, unknown>
  const preauthMetadata = preauthData.metadata as Record<string, unknown>
  assert.equal(preauthMetadata.reservedUnits, '1')
  assert.equal(preauthMetadata.preauthorized, true)
  assert.equal(trace?.reservedUnits, 1n)
})

test('successful auxiliary calls from failed and winning provider candidates are both charge-attributed', () => {
  const runner = auxiliaryRunner({}, {}) as unknown as {
    auxiliaryChargeTotals: (traces: Array<Record<string, unknown>>) => { chargedUnits: bigint; chargedCredits: bigint }
  }
  const common = {
    purpose: 'web_search_planning',
    usage: { prompt_tokens: 1, completion_tokens: 1, cached_input_tokens: 0, reasoning_tokens: 0 },
    usageSource: 'PROVIDER',
    estimatedUsageFields: [],
    pricingSnapshot: {},
    upstreamCostMicros: 1,
    reservedUnits: 0n,
  }

  const totals = runner.auxiliaryChargeTotals([
    { ...common, providerAttemptId: 'aux-candidate-a', provider: 'system:openai', model: 'model-a', chargedUnits: 2n, chargedCredits: 3n, status: 'SUCCEEDED' },
    { ...common, providerAttemptId: 'aux-candidate-b', provider: 'system:anthropic', model: 'model-b', chargedUnits: 5n, chargedCredits: 7n, status: 'SUCCEEDED' },
    { ...common, providerAttemptId: 'aux-failed', provider: 'system:gemini', model: 'model-c', chargedUnits: 100n, chargedCredits: 100n, status: 'FAILED' },
  ])

  assert.deepEqual(totals, { chargedUnits: 7n, chargedCredits: 10n })
})

test('failed auxiliary provider calls retain a zero-impact audit ledger', async () => {
  let ledgerUpsert: Record<string, unknown> | undefined
  const runner = auxiliaryRunner({
    providerAttempt: {
      create: async () => ({ id: 'attempt-failed' }),
      update: async () => ({ id: 'attempt-failed' }),
    },
    tokenUsageLedger: {
      upsert: async (input: Record<string, unknown>) => { ledgerUpsert = input; return { id: 'ledger-failed' } },
    },
  }, { recordCredentialUsage: async () => undefined }) as unknown as {
    trackAuxiliaryProviderCall: (
      task: object,
      resolved: object,
      purpose: 'web_search_planning',
      round: number | undefined,
      execute: () => Promise<object>,
    ) => Promise<object>
  }

  await assert.rejects(
    runner.trackAuxiliaryProviderCall(
      { id: 'job-failed', userId: 'user-1', options: { billing: { billingSource: 'SUBSCRIPTION_QUOTA' } } },
      resolvedProvider,
      'web_search_planning',
      undefined,
      async () => { throw new Error('upstream failed') },
    ),
    /upstream failed/,
  )

  const ledger = ledgerUpsert?.create as Record<string, unknown>
  assert.equal(ledger.idempotencyKey, 'job:job-failed:token-ledger:aux:attempt-failed')
  assert.equal(ledger.chargedUnits, 0n)
  assert.equal(ledger.inputTokens, 0)
  assert.equal((ledger.pricingSnapshot as Record<string, unknown>).callStatus, 'FAILED')
  assert.equal((ledger.pricingSnapshot as Record<string, unknown>).financialImpact, 'NONE')
})

test('auxiliary detail ledger writes are idempotent by provider attempt', async () => {
  const keys: string[] = []
  const runner = auxiliaryRunner({
    tokenUsageLedger: {
      upsert: async (input: Record<string, unknown>) => {
        keys.push(String((input.where as Record<string, unknown>).idempotencyKey))
        assert.deepEqual(input.update, {})
        return { id: 'ledger-1' }
      },
    },
  }, {}) as unknown as {
    persistAuxiliaryUsageDetail: (task: object, billing: object, trace: object) => Promise<void>
  }
  const trace = {
    providerAttemptId: 'attempt-1',
    purpose: 'agent_tool_planning',
    model: 'gpt-test',
    provider: 'system:openai',
    usage: { prompt_tokens: 10, completion_tokens: 2, cached_input_tokens: 0, reasoning_tokens: 0 },
    usageSource: 'PROVIDER',
    estimatedUsageFields: [],
    pricingSnapshot: { inputRate: 100, outputRate: 300 },
    upstreamCostMicros: 1,
    chargedUnits: 1n,
    chargedCredits: 1n,
    reservedUnits: 1n,
    status: 'SUCCEEDED',
  }

  await runner.persistAuxiliaryUsageDetail({ id: 'job-1', userId: 'user-1' }, {}, trace)
  await runner.persistAuxiliaryUsageDetail({ id: 'job-1', userId: 'user-1' }, {}, trace)

  assert.deepEqual(keys, [
    'job:job-1:token-ledger:aux:attempt-1',
    'job:job-1:token-ledger:aux:attempt-1',
  ])
})

test('auxiliary usage fails closed when its detail ledger cannot be persisted', async () => {
  let credentialUsageRecorded = false
  const runner = auxiliaryRunner({
    providerAttempt: {
      create: async () => ({ id: 'attempt-ledger-failure' }),
      update: async () => ({ id: 'attempt-ledger-failure' }),
    },
    tokenUsageLedger: {
      upsert: async () => { throw new Error('database unavailable') },
    },
  }, { recordCredentialUsage: async () => { credentialUsageRecorded = true } }) as unknown as {
    trackAuxiliaryProviderCall: (
      task: object,
      resolved: object,
      purpose: 'web_search_planning',
      round: number | undefined,
      execute: () => Promise<object>,
    ) => Promise<object>
  }

  await assert.rejects(
    runner.trackAuxiliaryProviderCall(
      { id: 'job-ledger-failure', userId: 'user-1', options: { billing: { billingSource: 'SUBSCRIPTION_QUOTA' } } },
      resolvedProvider,
      'web_search_planning',
      undefined,
      async () => ({ usage: { prompt_tokens: 100, completion_tokens: 10 }, usageSource: 'PROVIDER' }),
    ),
    /辅助模型调用审计或账本写入失败/,
  )
  assert.equal(credentialUsageRecorded, false)
})

test('missing auxiliary quota reservation marks the running attempt failed before aborting', async () => {
  const terminalUpdates: Array<Record<string, unknown>> = []
  let executed = false
  const runner = auxiliaryRunner({
    providerAttempt: {
      create: async () => ({ id: 'attempt-missing-reservation' }),
      updateMany: async (input: Record<string, unknown>) => { terminalUpdates.push(input); return { count: 1 } },
    },
  }, {}, {}) as unknown as {
    trackAuxiliaryProviderCall: (
      task: object,
      resolved: object,
      purpose: 'web_search_planning',
      round: number | undefined,
      execute: () => Promise<object>,
      onTrace: undefined,
      reservationEstimate: { inputTokens: number; outputTokens: number },
    ) => Promise<object>
  }

  await assert.rejects(
    runner.trackAuxiliaryProviderCall(
      { id: 'job-missing-reservation', userId: 'user-1', options: { billing: { billingSource: 'SUBSCRIPTION_QUOTA', quotaEnabled: true } } },
      resolvedProvider,
      'web_search_planning',
      undefined,
      async () => { executed = true; return {} },
      undefined,
      { inputTokens: 1_000, outputTokens: 100 },
    ),
    /辅助模型调用缺少计费预留/,
  )

  assert.equal(executed, false)
  assert.equal(terminalUpdates.length, 1)
  assert.deepEqual(terminalUpdates[0]?.where, { id: 'attempt-missing-reservation', status: 'RUNNING' })
  assert.equal((terminalUpdates[0]?.data as Record<string, unknown>).status, 'FAILED')
})

test('auxiliary success audit failure requires reconciliation without downgrading the attempt', async () => {
  const terminalUpdates: Array<Record<string, unknown>> = []
  const runner = auxiliaryRunner({
    providerAttempt: {
      create: async () => ({ id: 'attempt-audit-failure' }),
      update: async () => { throw new Error('database unavailable') },
      updateMany: async (input: Record<string, unknown>) => { terminalUpdates.push(input); return { count: 1 } },
    },
  }, {}) as unknown as {
    trackAuxiliaryProviderCall: (
      task: object,
      resolved: object,
      purpose: 'web_search_planning',
      round: number | undefined,
      execute: () => Promise<object>,
    ) => Promise<object>
  }

  await assert.rejects(
    runner.trackAuxiliaryProviderCall(
      { id: 'job-audit-failure', userId: 'user-1', options: { billing: { billingSource: 'SUBSCRIPTION_QUOTA' } } },
      resolvedProvider,
      'web_search_planning',
      undefined,
      async () => ({ usage: { prompt_tokens: 100, completion_tokens: 10 }, usageSource: 'PROVIDER' }),
    ),
    (error: unknown) => error instanceof ReconciliationRequiredError && /辅助模型调用审计或账本写入失败/.test(error.message),
  )

  assert.equal(terminalUpdates.length, 0)
})

const runningChatTask = () => ({
  id: 'job-chat',
  userId: 'user-1',
  model: 'gpt-test',
  options: {},
  pricingSnapshot: null,
  status: 'RUNNING',
  lockedBy: 'worker-1',
  leaseVersion: 7,
  leaseExpiresAt: new Date(Date.now() + 60_000),
})

type PrimaryFailoverHarness = {
  withProviderFailover: (
    task: object,
    capability: 'CHAT',
    execute: (provider: object) => Promise<object>,
  ) => Promise<object>
}

test('primary ProviderAttempt creation failure prevents the Provider call', async () => {
  let providerCalls = 0
  const runner = auxiliaryRunner(
    { generationJob: { updateMany: async () => ({ count: 1 }) } },
    { resolveCandidates: async () => [resolvedProvider] },
    {},
    {
      start: async () => { throw new TerminalSettlementError('attempt unavailable') },
      succeed: async () => undefined,
      fail: async () => undefined,
    },
  ) as unknown as PrimaryFailoverHarness

  await assert.rejects(
    runner.withProviderFailover(runningChatTask(), 'CHAT', async () => {
      providerCalls += 1
      return {}
    }),
    (error: unknown) => error instanceof TerminalSettlementError && /attempt unavailable/.test(error.message),
  )
  assert.equal(providerCalls, 0)
})

for (const status of ['RUNNING', 'SUCCEEDED'] as const) {
  test(`Chat does not replay a Provider when a legacy primary ${status} attempt exists`, async () => {
    let providerCalls = 0
    const prisma = {
      providerAttempt: {
        findMany: async () => [{ id: `attempt-${status.toLowerCase()}`, status, metadata: { auxiliary: false } }],
        create: async () => { throw new Error('must not create a duplicate attempt') },
      },
      generationJob: { updateMany: async () => ({ count: 1 }) },
      $transaction: async <T>(callback: (tx: object) => Promise<T>) => callback(prisma),
    }
    const runner = auxiliaryRunner(
      prisma,
      { resolveCandidates: async () => [resolvedProvider] },
      {},
      new ProviderAttemptAuditService(prisma as never),
    ) as unknown as PrimaryFailoverHarness

    await assert.rejects(
      withLease(() => runner.withProviderFailover(runningChatTask(), 'CHAT', async () => {
        providerCalls += 1
        return {}
      })),
      (error: unknown) => error instanceof ReconciliationRequiredError && /必须先对账/.test(error.message),
    )
    assert.equal(providerCalls, 0)
  })
}

test('a successful auxiliary attempt does not block the Chat primary Provider call', async () => {
  let providerCalls = 0
  let routeUpdate: Record<string, unknown> | undefined
  const prisma = {
    providerAttempt: {
      findMany: async () => [{ id: 'attempt-aux', status: 'SUCCEEDED', metadata: { auxiliary: true } }],
      create: async () => ({ id: 'attempt-primary' }),
      updateMany: async () => ({ count: 1 }),
    },
    generationJob: {
      updateMany: async (input: Record<string, unknown>) => { routeUpdate = input; return { count: 1 } },
    },
    $transaction: async <T>(callback: (tx: object) => Promise<T>) => callback(prisma),
  }
  const runner = auxiliaryRunner(
    prisma,
    { resolveCandidates: async () => [resolvedProvider], recordCandidateResult: async () => undefined },
    {},
    new ProviderAttemptAuditService(prisma as never),
  ) as unknown as PrimaryFailoverHarness

  const result = await withLease(() => runner.withProviderFailover(runningChatTask(), 'CHAT', async () => {
    providerCalls += 1
    return { response: { providerRequestId: 'request-1' } }
  })) as { providerAttemptId: string }

  assert.equal(providerCalls, 1)
  assert.equal(result.providerAttemptId, 'attempt-primary')
  assert.equal((routeUpdate?.data as Record<string, unknown>).settlementStatus, 'RECONCILING')
})

test('primary Provider success audit failure requests reconciliation without failure downgrade', async () => {
  let providerCalls = 0
  let failedAttempts = 0
  let routeUpdates = 0
  const runner = auxiliaryRunner(
    { generationJob: { updateMany: async () => { routeUpdates += 1; return { count: 1 } } } },
    { resolveCandidates: async () => [resolvedProvider] },
    {},
    {
      start: async () => ({ id: 'attempt-primary-audit-failure' }),
      succeed: async () => { throw new ReconciliationRequiredError('attempt success audit unavailable') },
      fail: async () => { failedAttempts += 1 },
    },
  ) as unknown as PrimaryFailoverHarness

  await assert.rejects(
    runner.withProviderFailover(runningChatTask(), 'CHAT', async () => {
      providerCalls += 1
      return { response: { providerRequestId: 'request-1' } }
    }),
    (error: unknown) => error instanceof ReconciliationRequiredError && /success audit unavailable/.test(error.message),
  )

  assert.equal(providerCalls, 1)
  assert.equal(failedAttempts, 0)
  assert.equal(routeUpdates, 0)
})

test('primary success route persistence is fenced by the active worker lease', async () => {
  let routeUpdate: Record<string, unknown> | undefined
  let fencedGenerationId = ''
  const task = runningChatTask()
  const prisma = {
    generationJob: {
      updateMany: async (input: Record<string, unknown>) => { routeUpdate = input; return { count: 1 } },
    },
  }
  const runner = auxiliaryRunner(
    prisma,
    { resolveCandidates: async () => [resolvedProvider], recordCandidateResult: async () => undefined },
    {},
    {
      start: async () => ({ id: 'attempt-primary' }),
      succeed: async () => undefined,
      fail: async () => undefined,
      withActiveLease: async (generationId: string, operation: (tx: object) => Promise<unknown>) => {
        fencedGenerationId = generationId
        return operation(prisma)
      },
    },
  ) as unknown as PrimaryFailoverHarness

  await runner.withProviderFailover(
    task,
    'CHAT',
    async () => ({ response: { providerRequestId: 'request-1' } }),
  )

  const where = routeUpdate?.where as Record<string, unknown>
  assert.equal(fencedGenerationId, task.id)
  assert.equal(where.id, task.id)
  assert.equal(where.status, 'RUNNING')
  assert.equal((routeUpdate?.data as Record<string, unknown>).settlementStatus, 'RECONCILING')
})

test('retryable Chat Provider failures select and audit the next candidate', async () => {
  const failures = [
    { label: '429', error: new ProviderRequestError('rate limited', 429) },
    { label: '500', error: new ProviderRequestError('internal error', 500) },
    { label: '502', error: new ProviderRequestError('bad gateway', 502) },
    { label: 'timeout', error: new ProviderRequestError('request timed out') },
    { label: 'network error', error: new ProviderRequestError('fetch failed') },
  ]

  for (const failure of failures) {
    let providerCalls = 0
    let attemptSequence = 0
    const failedAttempts: string[] = []
    const succeededAttempts: string[] = []
    const candidates = [
      { ...resolvedProvider, providerId: 'provider-a', routeId: 'route-a' },
      { ...resolvedProvider, providerId: 'provider-b', routeId: 'route-b' },
    ]
    const prisma = { generationJob: { updateMany: async () => ({ count: 1 }) } }
    const runner = auxiliaryRunner(
      prisma,
      { resolveCandidates: async () => candidates, recordCandidateResult: async () => undefined },
      {},
      {
        start: async () => ({ id: `attempt-${++attemptSequence}` }),
        succeed: async ({ id }: { id: string }) => { succeededAttempts.push(id) },
        fail: async ({ id }: { id: string }) => { failedAttempts.push(id) },
        withActiveLease: async (_generationId: string, operation: (tx: object) => Promise<unknown>) => operation(prisma),
      },
    ) as unknown as PrimaryFailoverHarness

    const result = await runner.withProviderFailover(runningChatTask(), 'CHAT', async () => {
      providerCalls += 1
      if (providerCalls === 1) throw failure.error
      return { response: { providerRequestId: 'request-b' } }
    }) as { providerAttemptId: string }

    assert.equal(providerCalls, 2, failure.label)
    assert.deepEqual(failedAttempts, ['attempt-1'], failure.label)
    assert.deepEqual(succeededAttempts, ['attempt-2'], failure.label)
    assert.equal(result.providerAttemptId, 'attempt-2', failure.label)
  }
})

test('a stream disconnect after the first delta requires reconciliation and never fails over', async () => {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  let fetchCalls = 0
  let starts = 0
  let succeeds = 0
  let fails = 0
  const deltas: string[] = []
  const candidate = {
    ...resolvedProvider,
    apiKey: 'test-key',
    baseUrl: 'https://provider.example/v1',
    apiProtocol: 'openai',
    timeoutMs: 5_000,
    options: {},
  }
  globalThis.fetch = (async () => {
    fetchCalls += 1
    let reads = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (reads++ === 0) {
          controller.enqueue(encoder.encode('data: {"id":"request-stream-1","choices":[{"delta":{"content":"hello"}}]}\n\n'))
          return
        }
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            controller.error(new Error('socket reset'))
            resolve()
          }, 5)
        })
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch

  try {
    const runner = auxiliaryRunner(
      {},
      {
        resolveCandidates: async () => [candidate, { ...candidate, providerId: 'provider-2', routeId: 'route-2' }],
        buildRequestHeaders: () => ({}),
      },
      {},
      {
        start: async () => { starts += 1; return { id: `attempt-${starts}` } },
        succeed: async () => { succeeds += 1 },
        fail: async () => { fails += 1 },
      },
    ) as unknown as {
      withProviderFailover: (task: object, capability: 'CHAT', execute: (provider: object) => Promise<unknown>) => Promise<unknown>
      providerChatStream: (provider: object, messages: Array<{ role: string; content: string }>, maxTokens: number, onDelta: (delta: string) => Promise<void>) => Promise<unknown>
    }

    await assert.rejects(
      runner.withProviderFailover(runningChatTask(), 'CHAT', (provider) => runner.providerChatStream(
        provider,
        [{ role: 'user', content: 'hello' }],
        128,
        async (delta) => { deltas.push(delta) },
      )),
      (error: unknown) => error instanceof ReconciliationRequiredError && /socket reset/.test(error.message),
    )

    assert.deepEqual(deltas, ['hello'])
    assert.equal(fetchCalls, 1)
    assert.equal(starts, 1)
    assert.equal(succeeds, 0)
    assert.equal(fails, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
