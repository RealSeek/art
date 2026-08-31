import assert from 'node:assert/strict'
import test from 'node:test'
import {
  publicExportGenerationSelect,
  toPublicExportGeneration,
} from '../../server/src/exports/public-export-generation.dto'
import { publicAssetMetadata } from '../../server/src/assets/public-asset.dto'
import { publicMessageMetadata } from '../../server/src/conversations/public-message.dto'

const now = new Date('2026-08-31T00:00:00.000Z')

test('export generation mapper excludes routing fields and sanitizes internal errors', () => {
  const internal = {
    id: 'job-1',
    kind: 'VIDEO' as const,
    status: 'FAILED' as const,
    model: 'public-model',
    prompt: 'public prompt',
    creditCost: 7,
    inputTokens: 11,
    outputTokens: 13,
    cachedInputTokens: 5,
    reasoningTokens: 3,
    createdAt: now,
    completedAt: now,
    errorMessage: 'HTTP 500 from provider.internal using route-secret',
    provider: 'system:private-provider',
    errorCode: 'PROVIDER_HTTP_500',
  }
  const result = toPublicExportGeneration(internal)

  assert.deepEqual(result, {
    id: 'job-1',
    kind: 'VIDEO',
    status: 'FAILED',
    model: 'public-model',
    prompt: 'public prompt',
    creditCost: 7,
    inputTokens: 11,
    outputTokens: 13,
    cachedInputTokens: 5,
    reasoningTokens: 3,
    createdAt: now,
    completedAt: now,
    errorMessage: '视频生成暂时未能完成，请稍后重试。',
  })
  assert.equal('provider' in publicExportGenerationSelect, false)
  assert.equal('errorCode' in publicExportGenerationSelect, false)
  assert.doesNotMatch(JSON.stringify(result), /private-provider|provider\.internal|route-secret|PROVIDER_HTTP_500/)
})

test('export metadata uses the same public allowlists as API responses', () => {
  const message = publicMessageMetadata({
    jobId: 'job-1',
    reasoning: 'public reasoning',
    providerSource: 'system:private-provider',
    usage: { inputTokens: 5 },
    webSearch: { enabled: true, status: 'failed', error: 'private endpoint failed' },
  })
  const asset = publicAssetMetadata({
    purpose: 'generated',
    jobId: 'job-1',
    providerId: 'provider-secret',
    credentialId: 'credential-secret',
    options: { size: '1024x1024', billing: { reservationId: 'reservation-secret' } },
  })

  assert.deepEqual(message, {
    jobId: 'job-1',
    reasoning: 'public reasoning',
    webSearch: { enabled: true, status: 'failed', error: '搜索暂时不可用' },
  })
  assert.deepEqual(asset, {
    purpose: 'generated',
    jobId: 'job-1',
    options: { size: '1024x1024' },
  })
  assert.doesNotMatch(JSON.stringify([message, asset]), /private-provider|provider-secret|credential-secret|reservation-secret|private endpoint/)
})
