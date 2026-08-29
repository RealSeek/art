import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentToolsService } from '../../server/src/agent-tasks/agent-tools.service'

const task = { id: 'job-1', userId: 'user-1', assistantId: 'assistant-1', projectId: null, webSearchEnabled: false }
const descriptor = {
  id: 'tool-1',
  key: 'external_workflow',
  name: '外部工作流',
  description: '测试工具',
  requiresApproval: true,
  kind: 'external' as const,
  inputSchema: {
    type: 'object',
    properties: { task: { type: 'string' } },
    required: ['task'],
    additionalProperties: false,
  },
}

test('外部工具执行会使用后台配置的方法、请求头、密钥和幂等键', async () => {
  const originalFetch = globalThis.fetch
  let request: { url: string; init?: RequestInit } | undefined
  const audits: Array<Record<string, unknown>> = []
  const prisma = {
    toolDefinition: {
      findFirst: async () => ({
        id: 'tool-1', endpoint: 'https://workflow.example.test/run', httpMethod: 'PUT', timeoutMs: 5000,
        headers: { 'X-Public': 'public-value' }, encryptedHeaders: 'encrypted-value',
      }),
    },
    toolCallAudit: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data } },
  }
  const crypto = { decrypt: () => JSON.stringify({ Authorization: 'Bearer secret-value' }) }
  const endpointPolicy = { assertPublicHttpUrl: async (value: string) => new URL(value) }
  const service = new AgentToolsService(prisma as never, crypto as never, {} as never, {} as never, endpointPolicy as never)
  try {
    globalThis.fetch = async (url, init) => {
      request = { url: String(url), init }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    const result = await service.execute(task, descriptor, { task: '生成日报' }, 'job-1:tool-1')
    assert.deepEqual(result, { ok: true })
    assert.equal(request?.url, 'https://workflow.example.test/run')
    assert.equal(request?.init?.method, 'PUT')
    const headers = request?.init?.headers as Record<string, string>
    assert.equal(headers['X-Public'], 'public-value')
    assert.equal(headers.Authorization, 'Bearer secret-value')
    assert.equal(headers['Idempotency-Key'], 'job-1:tool-1')
    assert.equal(request?.init?.body, JSON.stringify({ task: '生成日报' }))
    assert.equal(audits.length, 1)
    assert.equal(audits[0]?.status, 'SUCCEEDED')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('外部工具在发出请求前校验输入 Schema', async () => {
  let queried = false
  const prisma = {
    toolDefinition: { findFirst: async () => { queried = true; return null } },
    toolCallAudit: { create: async () => undefined },
  }
  const service = new AgentToolsService(prisma as never, {} as never, {} as never, {} as never, {} as never)
  await assert.rejects(
    service.execute(task, descriptor, { unknown: true }),
    /工具参数校验失败/,
  )
  assert.equal(queried, false)
})
