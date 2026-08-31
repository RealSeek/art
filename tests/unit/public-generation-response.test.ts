import assert from 'node:assert/strict'
import test from 'node:test'
import { toPublicGeneration, toPublicGenerationEvent } from '../../server/src/generations/public-generation.dto'

const now = new Date('2026-08-31T00:00:00.000Z')
const chatKind = 'CHAT' as Parameters<typeof toPublicGenerationEvent>[1]

function internalGeneration() {
  return {
    id: 'job-public',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    kind: 'CHAT' as const,
    status: 'FAILED' as const,
    model: 'public-model-name',
    prompt: 'hello',
    options: {
      requestedModel: 'public-model-name',
      size: '1024x1024',
      imagePromptResult: { prompt: 'safe result' },
      billing: { quotaId: 'quota-secret', quotaReservations: [{ reservationId: 'reservation-secret' }] },
      providerAttempts: [{ providerId: 'provider-secret', error: 'internal upstream error' }],
      successfulRouteId: 'route-secret',
      successfulCredentialId: 'credential-secret',
      projectSkill: { content: 'internal skill prompt' },
      privacy: { shareUsageAnalytics: false },
    },
    creditCost: 7,
    inputTokens: 11,
    outputTokens: 13,
    cachedInputTokens: 5,
    reasoningTokens: 3,
    errorMessage: 'HTTP 500 from provider.internal: upstream request secret',
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    outputs: [{
      id: 'output-1',
      assetId: 'asset-1',
      position: 0,
      asset: {
        id: 'asset-1',
        projectId: 'project-1',
        teamId: null,
        kind: 'IMAGE' as const,
        name: 'output.png',
        objectKey: 'users/user-secret/generated/output.png',
        mimeType: 'image/png',
        size: 42n,
        width: 1024,
        height: 1024,
        metadata: {
          purpose: 'generated',
          jobId: 'job-public',
          options: { size: '1024x1024', providerAttempts: [{ providerId: 'provider-secret' }], billing: { quotaId: 'quota-secret' } },
          providerId: 'provider-secret',
          credentialId: 'credential-secret',
        },
        createdAt: now,
      },
    }],
    events: [{
      id: 'event-1',
      sequence: 1,
      type: 'error',
      payload: { code: 'HTTP_500', message: 'provider.internal returned secret', attemptsMade: 3 },
      createdAt: now,
    }],
  }
}

test('public generation mapper exposes the UI contract without internal routing, billing, or lease fields', () => {
  const internal = {
    ...internalGeneration(),
    provider: 'system:openai',
    providerChannelId: 'provider-secret',
    userCredentialId: 'credential-secret',
    userModelRouteId: 'route-secret',
    pricingSnapshot: { inputRate: 123 },
    upstreamCostMicros: 1234,
    revenueMicros: 5678,
    lockedBy: 'worker-secret',
    leaseVersion: 9,
    leaseExpiresAt: now,
    heartbeatAt: now,
    providerJobId: 'provider-job-secret',
    providerAttempts: [{ id: 'attempt-secret' }],
    billingTransactions: [{ id: 'billing-secret' }],
    usageRecords: [{ id: 'usage-secret' }],
  }
  const result = toPublicGeneration(internal, {
    messageId: 'message-1',
    content: 'partial response',
    model: 'public-model-name',
    metadata: {
      reasoning: 'safe reasoning',
      suggestions: ['next'],
      providerSource: 'system',
      providerType: 'OPENAI',
      presetKey: 'private:secret',
      apiProtocol: 'OPENAI_RESPONSES',
      webSearch: { enabled: true, status: 'failed', queries: ['query'], sources: [], error: 'internal search endpoint failed' },
    },
  })

  assert.deepEqual(result.options, {
    requestedModel: 'public-model-name',
    size: '1024x1024',
    imagePromptResult: { prompt: 'safe result' },
  })
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 13, totalTokens: 24, cachedTokens: 5, reasoningTokens: 3 })
  assert.equal(result.errorMessage, '回复生成暂时未能完成，请稍后重试。')
  assert.equal(result.outputs[0].asset.size, 42)
  assert.equal('objectKey' in result.outputs[0].asset, false)
  assert.equal('storageDriver' in result.outputs[0].asset, false)
  assert.deepEqual(result.outputs[0].asset.metadata, {
    purpose: 'generated',
    jobId: 'job-public',
    options: { size: '1024x1024' },
  })
  assert.deepEqual(result.stream?.metadata, {
    reasoning: 'safe reasoning',
    suggestions: ['next'],
    webSearch: { enabled: true, status: 'failed', queries: ['query'], sources: [], error: '搜索暂时不可用' },
  })

  for (const field of [
    'provider', 'providerChannelId', 'userCredentialId', 'userModelRouteId', 'pricingSnapshot',
    'upstreamCostMicros', 'revenueMicros', 'lockedBy', 'leaseVersion', 'leaseExpiresAt',
    'heartbeatAt', 'providerJobId', 'settlementStatus', 'providerAttempts', 'billingTransactions',
    'usageRecords', 'tokenQuotaReservations',
  ]) assert.equal(field in result, false, field)

  assert.doesNotMatch(JSON.stringify(result), /provider-secret|credential-secret|route-secret|quota-secret|reservation-secret|internal upstream error|internal search endpoint|users\/user-secret/)
})

test('public generation events keep safe progress and usage while redacting internal errors', () => {
  const usage = toPublicGenerationEvent({
    id: 'event-usage',
    sequence: 2,
    type: 'usage',
    payload: { inputTokens: 11, outputTokens: 13, cachedInputTokens: 5, reasoningTokens: 3, usageSource: 'PROVIDER', providerRequestId: 'secret' },
    createdAt: now,
  }, chatKind)
  const error = toPublicGenerationEvent({
    id: 'event-error',
    sequence: 3,
    type: 'error',
    payload: { code: 'HTTP_500', message: 'provider.internal returned secret', attemptsMade: 3 },
    createdAt: now,
  }, chatKind)

  assert.deepEqual(usage.payload, { inputTokens: 11, outputTokens: 13, totalTokens: 24, cachedTokens: 5, reasoningTokens: 3 })
  assert.deepEqual(error.payload, { message: '回复生成暂时未能完成，请稍后重试。' })
  assert.doesNotMatch(JSON.stringify([usage, error]), /usageSource|providerRequestId|HTTP_500|provider\.internal|attemptsMade/)
})

test('cancelled jobs never expose reconciliation errors', () => {
  const result = toPublicGeneration({
    ...internalGeneration(),
    status: 'CANCELLED' as const,
    errorMessage: '取消时存在 SUCCEEDED ProviderAttempt，已保留账务预留等待对账',
    events: [],
  })

  assert.equal(result.errorMessage, '任务已取消')
  assert.doesNotMatch(JSON.stringify(result), /ProviderAttempt|账务预留|等待对账/)
})
