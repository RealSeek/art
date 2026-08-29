import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentTaskCancellationService } from '../../server/src/agent-tasks/agent-task-cancellation.service'

test('Agent 任务取消会中止活动请求并在关闭监听后释放引用', () => {
  const prisma = { agentTask: { findUnique: async () => ({ status: 'RUNNING' }) } }
  const service = new AgentTaskCancellationService(prisma as never)
  const first = service.watch('task-1')
  const second = service.watch('task-1')

  assert.equal(first.signal.aborted, false)
  assert.equal(second.signal.aborted, false)
  first.close()
  service.cancel('task-1')

  assert.equal(first.signal.aborted, false)
  assert.equal(second.signal.aborted, true)
  assert.match(String(second.signal.reason), /Agent 任务已取消/)
  second.close()
  assert.equal(service.signal('task-1'), undefined)
})
