import assert from 'node:assert/strict'
import test from 'node:test'
import { GenerationsService } from '../../server/src/generations/generations.service'
import { ProvidersService } from '../../server/src/providers/providers.service'
import { providerSourceRequirement } from '../../server/src/providers/provider-routing'
import { AssetsController } from '../../server/src/assets/assets.controller'

function harness() {
  const now = new Date()
  const models = [
    { key: 'private:text', upstreamModel: 'text', displayName: 'Text', source: 'USER', availability: 'AVAILABLE', isDefault: true, options: { agentCapabilities: { supportsVision: false } } },
    { key: 'private:vision', upstreamModel: 'vision', displayName: 'Vision', source: 'USER', availability: 'AVAILABLE', isDefault: false, options: { discovery: { features: ['vision'] } } },
    { key: 'private:other', upstreamModel: 'other', displayName: 'Other', source: 'USER', availability: 'AVAILABLE', isDefault: false, options: { agentCapabilities: { supportsVision: true } } },
  ]
  const job: Record<string, any> = { id: 'extract-job', kind: 'CHAT', status: 'QUEUED', model: 'vision', options: {}, creditCost: 0, createdAt: now, updatedAt: now, outputs: [], conversationId: null }
  const resolveCalls: Array<{ model: string; options: object }> = []
  const messages: Array<Record<string, any>> = []
  const conversations: Array<Record<string, any>> = []
  let listQuery: unknown
  const settings = { imagePromptEnabled: true, imagePromptModelKey: 'vision', temporaryChatRetentionHours: 24 }
  const prisma = {
    systemSetting: { upsert: async () => settings, findUnique: async () => settings },
    asset: { findFirst: async () => ({ id: 'asset', kind: 'IMAGE', mimeType: 'image/png', size: 20n }) },
    generationJob: {
      findFirst: async () => job,
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(job, data); return job },
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(job, data); return job },
      findUniqueOrThrow: async () => job,
      findMany: async (query: unknown) => { listQuery = query; return [] },
    },
    userSubscription: { findFirst: async () => null }, userSettings: { findUnique: async () => ({ temporaryChatDefault: false, chatHistoryEnabled: true }) },
    subscriptionPlan: { findFirst: async () => null }, user: { findUnique: async () => ({ role: 'USER' }) }, modelPriceVersion: { findFirst: async () => null },
    conversation: {
      findFirst: async () => conversations[0] || null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const conversation = { id: 'conversation', ...data }; conversations.push(conversation); return { id: conversation.id } },
      update: async () => undefined,
    },
    message: { create: async ({ data }: { data: Record<string, unknown> }) => { const message = { id: `message-${messages.length}`, ...data }; messages.push(message); return message } },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>): Promise<T> => callback(prisma),
  }
  const service = new GenerationsService(prisma as never, {} as never, {} as never,
    { resolve: async () => true } as never,
    { listModelsForUser: async () => models, resolve: async (_user: string, model: string, _kind: string, options: object) => {
      resolveCalls.push({ model, options })
      return { source: 'user', type: 'NEW_API', presetKey: model, model: model.replace('private:', ''), options: {}, creditCost: 0, creditRatePercent: 100, creditValueMicros: 10000 }
    } } as never,
    { inspect: async () => undefined } as never, {} as never, { assetWhere: () => ({ userId: 'user' }) } as never,
    { append: async () => undefined } as never, {} as never, { snapshot: (value: unknown) => value } as never,
    { estimateMessages: () => 1 } as never, {} as never, { select: () => [] } as never, {} as never, { add: async () => undefined } as never)
  return { service, models, job, resolveCalls, messages, conversations, getListQuery: () => listQuery }
}

test('image prompt reuses chat models without requiring vision metadata or separate defaults', async () => {
  const { service, models } = harness()
  models[1].options = {}
  models.push({ ...models[1], key: 'private:unconfigured', availability: 'UNCONFIGURED' })
  models.push({ ...models[1], key: 'platform:vision', source: 'PLATFORM' })
  const catalog = await service.imagePromptModels('user')
  assert.deepEqual(catalog.models.map((model) => model.key), ['private:text', 'private:vision', 'private:other'])
  assert.equal(catalog.defaultModel, 'private:text')
})

test('explicit image prompt model is preserved while omitted model uses the chat default', async () => {
  const { service, resolveCalls } = harness()
  for (const model of ['private:other', undefined]) {
    await service.create('user', { kind: 'CHAT', model, prompt: 'extract', options: { taskType: 'IMAGE_PROMPT_EXTRACTION', assetId: 'asset' } })
  }
  assert.deepEqual(resolveCalls.map((call) => call.model), ['private:other', 'private:text'])
  assert.equal((resolveCalls[0].options as Record<string, unknown>).providerSource, 'user')
})

test('extraction resolves the same chat model and credential without a vision metadata gate', async () => {
  const service = new ProvidersService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { sourceRequirement: providerSourceRequirement } as never, {} as never)
  const internal = service as unknown as { resolvePrivateCandidates: (_userId: string, model: string, capability: string) => Promise<object[]> }
  const selected = { model: 'chat-model', credentialId: 'chat-key', options: { agentCapabilities: { supportsVision: false } } }
  internal.resolvePrivateCandidates = async (_userId, model, capability) => {
    assert.equal(model, 'private:chat-model')
    assert.equal(capability, 'CHAT')
    return [selected]
  }
  const extraction = await service.resolveCandidates('user', 'private:chat-model', 'CHAT', { taskType: 'IMAGE_PROMPT_EXTRACTION', providerSource: 'user' })
  const chat = await service.resolveCandidates('user', 'private:chat-model', 'CHAT', { providerSource: 'user' })
  assert.equal(extraction[0], chat[0])
  assert.equal(extraction[0].credentialId, 'chat-key')
})

test('extraction history filters task type in the database before applying the 100 row limit', async () => {
  const { service, getListQuery } = harness()
  await service.list('user', 'CHAT', 'IMAGE_PROMPT_EXTRACTION')
  assert.deepEqual((getListQuery() as { where: unknown }).where, { userId: 'user', kind: 'CHAT', options: { path: ['taskType'], equals: 'IMAGE_PROMPT_EXTRACTION' } })
})

test('continue extraction creates a reusable conversation with the original image and result', async () => {
  const { service, job, messages, conversations } = harness()
  job.status = 'SUCCEEDED'; job.options = { taskType: 'IMAGE_PROMPT_EXTRACTION', assetId: 'asset', requestedModel: 'private:vision', imagePromptResult: { prompt: 'A landscape', negativePrompt: 'Blur', summary: 'Landscape' } }
  assert.deepEqual(await service.continueImagePrompt('user', 'extract-job'), { id: 'conversation' })
  assert.equal(conversations[0].model, 'private:vision')
  assert.equal(messages[0].attachments.create.assetId, 'asset')
  assert.equal(messages[1].content, 'A landscape\n\n负向提示词：\nBlur')
  await service.continueImagePrompt('user', 'extract-job')
  assert.equal(conversations.length, 1)
  assert.equal(messages.length, 2)
  job.status = 'FAILED'
  await assert.rejects(service.continueImagePrompt('user', 'extract-job'), /只有成功/)
})

test('original asset lookup applies user access and excludes deleted files', async () => {
  let query: { where?: object } = {}
  let visible = true
  const controller = new AssetsController({} as never, { asset: { findFirst: async (input: typeof query) => {
    query = input
    return visible ? { id: 'asset', kind: 'IMAGE', name: 'source.png', mimeType: 'image/png', size: 1n, createdAt: new Date() } : null
  } } } as never, { assetWhere: (userId: string) => ({ userId }) } as never)
  const asset = await controller.get({ id: 'user' } as never, 'asset')
  assert.equal(asset.contentUrl, '/v1/assets/asset/content')
  assert.deepEqual(query.where, { id: 'asset', deletedAt: null, userId: 'user' })
  visible = false
  await assert.rejects(controller.get({ id: 'user' } as never, 'asset'), /不存在或你没有访问权限/)
})
