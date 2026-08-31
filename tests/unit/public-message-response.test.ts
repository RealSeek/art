import assert from 'node:assert/strict'
import test from 'node:test'
import { toPublicMessage } from '../../server/src/conversations/public-message.dto'

test('public message mapper excludes provider, token, deletion, and author email fields', () => {
  const now = new Date('2026-08-31T00:00:00.000Z')
  const internalMessage = {
    id: 'message-public',
    conversationId: 'conversation-secret',
    authorId: 'author-secret',
    role: 'ASSISTANT' as const,
    content: 'public answer',
    model: 'public-model',
    inputTokens: 100,
    outputTokens: 200,
    metadata: {
      jobId: 'job-public',
      reasoning: 'public reasoning',
      providerSource: 'system',
      providerType: 'OPENAI',
      presetKey: 'preset-secret',
      apiProtocol: 'OPENAI_RESPONSES',
      webSearch: { enabled: true, status: 'failed', queries: ['query'], sources: [], error: 'provider.internal failed' },
    },
    deletedAt: null,
    deletedById: 'deleter-secret',
    createdAt: now,
    parentId: null,
    branchIndex: 0,
    author: { id: 'author-public', displayName: 'Author', email: 'secret@example.com' },
    attachments: [],
  }
  const result = toPublicMessage(internalMessage)

  assert.deepEqual(result, {
    id: 'message-public',
    role: 'ASSISTANT',
    content: 'public answer',
    model: 'public-model',
    metadata: {
      jobId: 'job-public',
      reasoning: 'public reasoning',
      webSearch: { enabled: true, status: 'failed', queries: ['query'], sources: [], error: '搜索暂时不可用' },
    },
    createdAt: now,
    parentId: null,
    branchIndex: 0,
    author: { id: 'author-public', displayName: 'Author' },
    attachments: [],
  })
  assert.doesNotMatch(JSON.stringify(result), /conversation-secret|author-secret|preset-secret|provider\.internal|secret@example\.com|inputTokens|outputTokens|providerSource|apiProtocol|deletedById/)
})
