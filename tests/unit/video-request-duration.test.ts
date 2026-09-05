import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'
import { ProvidersService } from '../../server/src/providers/providers.service'

test('视频完成后的下载地址保留 API 前缀', async () => {
  const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, { cleanup: async () => undefined } as never, {} as never, {} as never, {} as never)
  const internals = runner as any
  const stopped = new Error('已捕获结果地址')
  internals.withProviderFailover = async (_task: unknown, _capability: string, execute: (resolved: unknown) => Promise<any>) => {
    const result = await execute({ baseUrl: 'https://example.com/v1', model: 'MiniMaxH3-480p', videoCapabilities: { pollIntervalMs: 500 } })
    assert.equal(result.url, 'https://example.com/v1/videos/video-id/content')
    throw stopped
  }
  internals.provider = async () => ({ id: 'video-id' })
  internals.providerGet = async () => ({ status: 'completed' })
  internals.updateRunningTask = async () => undefined
  internals.assertNotCancelled = async () => undefined
  await assert.rejects(runner.run({ userId: 'test-user', prompt: '测试视频', options: {} } as never), error => error === stopped)
})

test('视频下载拒绝 HTML 和 JSON 响应', async () => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/html' ? 'text/html' : 'application/json')
    response.end(request.url === '/html' ? '<html></html>' : '{}')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address() as { port: number }
    const baseUrl = `http://127.0.0.1:${address.port}`
    const runner = new VideoGenerationRunner({} as never, {} as never, { buildRequestHeaders: () => ({}) } as never, {} as never, {} as never, {} as never, {} as never)
    for (const path of ['/html', '/json']) {
      await assert.rejects((runner as any).videoBytes(`${baseUrl}${path}`, { baseUrl, type: 'LOCAL_WORKER', timeoutMs: 1000 }), /非视频内容/)
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('MiniMax H3 导入配置使用模型指定的分辨率', () => {
  for (const resolution of ['480p', '720p']) {
    const options = (ProvidersService.prototype as any).discoveredModelOptions({ id: `[c]MiniMaxH3-${resolution}`, capability: 'VIDEO', flatCreditCost: 2 })
    assert.deepEqual(options.videoCapabilities.resolutions, [resolution])
    assert.equal(options.videoCapabilities.defaultResolution, resolution)
    assert.equal(options.videoCapabilities.pricing[`${resolution}:10`], 20)
  }
})

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
