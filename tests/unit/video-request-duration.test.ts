import assert from 'node:assert/strict'
import test from 'node:test'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'

test('视频请求保留数字 duration，兼容入口的 seconds 使用字符串', async () => {
  for (const type of ['NEW_API', 'SUB2API']) {
    const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
    const stopped = new Error('已捕获请求')
    const internals = runner as any
    internals.withProviderFailover = async (_task: unknown, _capability: string, execute: (resolved: unknown) => Promise<unknown>) => execute({ type, timeoutMs: 1000 })
    internals.provider = async (_resolved: unknown, path: string, body: Record<string, unknown>) => {
      assert.equal(path, '/videos')
      assert.equal(body.duration, 5)
      assert.equal(body.seconds, type === 'SUB2API' ? undefined : '5')
      throw stopped
    }
    await assert.rejects(runner.run({ userId: 'test-user', prompt: '测试视频', options: { duration: 5 } } as never), error => error === stopped)
  }
})
