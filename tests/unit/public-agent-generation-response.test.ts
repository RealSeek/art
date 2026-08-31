import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentTasksService } from '../../server/src/agent-tasks/agent-tasks.service'
import {
  publicAgentGenerationSelect,
  toPublicAgentGeneration,
} from '../../server/src/agent-tasks/public-agent-generation.dto'

const now = new Date('2026-08-31T00:00:00.000Z')

test('agent generation summary preserves its contract while redacting provider errors', () => {
  const result = toPublicAgentGeneration({
    id: 'job-1',
    kind: 'CHAT',
    status: 'FAILED',
    creditCost: 3,
    errorMessage: 'HTTP 500 from provider.internal with credential secret',
  })

  assert.deepEqual(result, {
    id: 'job-1',
    status: 'FAILED',
    creditCost: 3,
    errorMessage: '回复生成暂时未能完成，请稍后重试。',
  })
  assert.deepEqual(Object.keys(publicAgentGenerationSelect).sort(), [
    'creditCost', 'errorMessage', 'id', 'kind', 'status',
  ])
  assert.doesNotMatch(JSON.stringify(result), /provider\.internal|credential secret|kind/)
})

test('agent task list applies the public generation summary mapper', async () => {
  let query: Record<string, unknown> | undefined
  const task = {
    id: 'task-1',
    userId: 'user-1',
    updatedAt: now,
    generationJob: {
      id: 'job-1',
      kind: 'IMAGE' as const,
      status: 'FAILED' as const,
      creditCost: 4,
      errorMessage: '429 from private image provider route',
    },
  }
  const prisma = {
    agentTask: {
      findMany: async (value: Record<string, unknown>) => {
        query = value
        return [task]
      },
    },
  }
  const service = new AgentTasksService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )

  const result = await service.list('user-1')

  assert.equal(
    (query?.include as { generationJob: { select: unknown } }).generationJob.select,
    publicAgentGenerationSelect,
  )
  assert.deepEqual(result[0].generationJob, {
    id: 'job-1',
    status: 'FAILED',
    creditCost: 4,
    errorMessage: '图片生成请求较多，请稍后重试。',
  })
  assert.doesNotMatch(JSON.stringify(result[0].generationJob), /private image provider route|429/)
})
