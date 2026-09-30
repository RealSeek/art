import assert from 'node:assert/strict'
import test from 'node:test'
import { VideoGenerationRunner } from '../../server/src/generations/runners/video-generation.runner'
import { videoCapabilities } from '../../server/src/generations/video-options'

test('未配置轮询上限时视频任务不再有客户端超时', () => {
  assert.equal(videoCapabilities({}).maxPollSeconds, 0)
  assert.equal(videoCapabilities({ videoCapabilities: {} }).maxPollSeconds, 0)
  assert.equal(videoCapabilities({ videoCapabilities: { maxPollSeconds: 900 } }).maxPollSeconds, 900)
})

test('视频进度解析与轮询退避', () => {
  const runner = new VideoGenerationRunner({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  const internals = runner as unknown as { videoProgress: (payload: Record<string, unknown>) => number | null; pollDelay: (base: number, elapsed: number, count: number) => number }
  assert.equal(internals.videoProgress({ progress: 42 }), 42)
  assert.equal(internals.videoProgress({ progress: 130 }), 100)
  assert.equal(internals.videoProgress({ progress: 12.6 }), 13)
  assert.equal(internals.videoProgress({ data: { progress: 7 } }), 7)
  assert.equal(internals.videoProgress({}), null)
  assert.equal(internals.pollDelay(3000, 0, 0), 3000)
  assert.equal(internals.pollDelay(3000, 120_000, 5), 10_000)
  assert.equal(internals.pollDelay(3000, 420_000, 4), 20_000)
  assert.equal(internals.pollDelay(3000, 420_000, 5), 12_000)
  assert.equal(internals.pollDelay(500, 420_000, 4), 20_000)
})
