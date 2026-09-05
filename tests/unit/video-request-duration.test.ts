import assert from 'node:assert/strict'
import test from 'node:test'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'

test('视频时长按模型协议发送，MiniMax 不附加 Sora 专用字段', async () => {
  for (const [type, model, expectedSeconds] of [['NEW_API', 'sora-2', '5'], ['SUB2API', 'video', undefined], ['NEW_API', '[c]MiniMaxH3-480p', undefined], ['NEW_API', 'MiniMax-Hailuo-02', undefined]]) {
    const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
    const stopped = new Error('已捕获请求')
    const internals = runner as any
    internals.withProviderFailover = async (_task: unknown, _capability: string, execute: (resolved: unknown) => Promise<unknown>) => execute({ type, model, timeoutMs: 1000 })
    internals.provider = async (_resolved: unknown, path: string, body: Record<string, unknown>) => {
      assert.equal(path, '/videos')
      assert.equal(body.duration, 5)
      assert.equal(body.seconds, expectedSeconds)
      assert.equal(body.size, expectedSeconds === undefined ? undefined : '720p')
      throw stopped
    }
    await assert.rejects(runner.run({ userId: 'test-user', prompt: '测试视频', options: { duration: 5 } } as never), error => error === stopped)
  }
})
