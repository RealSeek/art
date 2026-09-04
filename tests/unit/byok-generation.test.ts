import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationsService } from '../../server/src/generations/generations.service'

test('用户密钥生成不会扣除个人或团队创作点', async () => {
  let createdData: Record<string, any> | undefined
  let resolvedOptions: Record<string, unknown> | undefined
  let spendCalls = 0
  const now = new Date()
  const job: Record<string, any> = {
    id: 'job-byok',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    kind: 'IMAGE',
    status: 'QUEUED',
    model: 'image-model',
    prompt: '生成一张海报',
    options: {},
    creditCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    outputs: [],
  }
  const generationJob = {
    findFirst: async () => null,
    count: async () => 0,
    create: async ({ data }: { data: Record<string, any> }) => {
      createdData = data
      Object.assign(job, data)
      return job
    },
    update: async ({ data }: { data: Record<string, any> }) => {
      Object.assign(job, data)
      return job
    },
    findUniqueOrThrow: async () => job,
  }
  const prisma = {
    generationJob,
    project: { findFirst: async () => ({ id: 'project-1', teamId: 'team-1', instructions: '', team: { status: 'ACTIVE', billingEnabled: true }, activeSkillVersion: null }) },
    conversation: { findFirst: async () => ({ id: 'conversation-1', projectId: 'project-1' }) },
    userSubscription: { findFirst: async () => null },
    userSettings: { findUnique: async () => null },
    subscriptionPlan: { findFirst: async () => null },
    user: { findUnique: async () => ({ role: 'USER' }) },
    modelPriceVersion: { findFirst: async () => null },
    pluginUsage: { create: async () => undefined },
    $transaction: async (callback: (tx: { generationJob: typeof generationJob; pluginUsage: { create: () => Promise<undefined> } }) => Promise<unknown>) => callback({ generationJob, pluginUsage: { create: async () => undefined } }),
  }
  const service = new GenerationsService(
    prisma as never,
    { spend: async () => { spendCalls += 1 } } as never,
    { safely: async (operation: Promise<unknown>) => operation } as never,
    {} as never,
    { resolve: async (_userId: string, _model: string, _capability: string, options: Record<string, unknown>) => {
      resolvedOptions = options
      return {
        source: 'user', type: 'NEW_API', baseUrl: 'https://onlycode.example/v1', apiKey: 'secret', authType: 'BEARER', headers: {}, timeoutMs: 120_000,
        model: 'image-model', presetKey: 'private:image-model', creditCost: 5, creditRatePercent: 100,
        settlementCurrency: 'CNY', creditValueMicros: 10_000, pricingUsdExchangeRateMicros: 1_000_000,
        inputCreditsPerMillion: 10, outputCreditsPerMillion: 20, baseInputCreditsPerMillion: 10, baseOutputCreditsPerMillion: 20,
        inputCostMicrosPerMillion: 0, outputCostMicrosPerMillion: 0, imageCostMicros: 0, videoCostMicros: 0,
        imageCapabilities: { sizes: ['1024x1024'], qualities: ['medium'], outputFormats: ['png'], backgrounds: ['auto'], maxCount: 4, defaultSize: '1024x1024', defaultQuality: 'medium', resolutionPricing: { '1K': 9 } },
      }
    } } as never,
    { inspect: async () => undefined } as never,
    {} as never,
    { projectWhere: () => ({}) } as never,
    { append: async () => undefined } as never,
    {} as never,
    { snapshot: (value: unknown) => value } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { add: async () => undefined } as never,
  )

  const result = await service.create('user-1', {
    kind: 'IMAGE' as never,
    prompt: '生成一张海报',
    model: 'image-model',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    options: { size: '1024x1024', quality: 'medium', count: 2 },
  })

  assert.equal(resolvedOptions?.providerSource, 'user')
  assert.equal(createdData?.creditCost, 0)
  assert.equal(createdData?.billingTeamId, null)
  assert.equal((createdData?.options.billing as Record<string, unknown>).baseCreditCost, 0)
  assert.equal(spendCalls, 0)
  assert.equal(result.creditCost, 0)
})
