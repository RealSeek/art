import assert from 'node:assert/strict'
import test from 'node:test'
import { clampVideoDuration, videoDurationOptions } from '../../src/utils/video-duration.ts'
import { MAX_VIDEO_DURATION_SECONDS, normalizeVideoOptions } from '../../server/src/generations/video-options'

test('时长档位固定包含 5/10/15 秒并按模型声明合并', () => {
  assert.deepEqual(videoDurationOptions([5, 10]), [5, 10, 15])
  assert.deepEqual(videoDurationOptions([8]), [5, 8, 10, 15])
  assert.deepEqual(videoDurationOptions([]), [5, 10, 15])
  // 超过 15 秒或非法的声明值不展示
  assert.deepEqual(videoDurationOptions([20, 30]), [5, 10, 15])
  assert.deepEqual(videoDurationOptions([0, 2.4]), [2, 5, 10, 15])
})

test('自定义秒数被限制在 1 到 15 秒之间', () => {
  assert.equal(clampVideoDuration('7', 5), 7)
  assert.equal(clampVideoDuration('0', 5), 1)
  assert.equal(clampVideoDuration('99', 5), MAX_VIDEO_DURATION_SECONDS)
  assert.equal(clampVideoDuration('abc', 5), 5)
  assert.equal(clampVideoDuration('', 10), 10)
})

test('模型自带时长区间时档位与自定义输入都收在该区间内', () => {
  assert.deepEqual(videoDurationOptions([5, 10, 15], 5, 15), [5, 10, 15])
  assert.deepEqual(videoDurationOptions([8], 5, 15), [5, 8, 10, 15])
  assert.deepEqual(videoDurationOptions([8, 10], 8, 12), [8, 10])
  assert.deepEqual(videoDurationOptions([5, 10], 8, 12), [10])
  assert.equal(clampVideoDuration('4', 5, 5, 15), 5)
  assert.equal(clampVideoDuration('99', 5, 5, 15), 15)
  assert.equal(clampVideoDuration('12', 5, 5, 15), 12)
})

test('服务端接受自定义时长并拒绝超过 15 秒', () => {
  const capabilities = { videoCapabilities: { resolutions: ['720p'], durations: [5, 10], aspectRatios: ['16:9'] } }
  assert.equal(normalizeVideoOptions({ resolution: '720p', duration: 7, aspectRatio: '16:9' }, capabilities).duration, 7)
  assert.equal(normalizeVideoOptions({ resolution: '720p', duration: 15, aspectRatio: '16:9' }, capabilities).duration, 15)
  assert.throws(() => normalizeVideoOptions({ resolution: '720p', duration: 16, aspectRatio: '16:9' }, capabilities), /between 1 and 15 seconds/)
  // 缺省值沿用模型默认时长；前端会把自定义输入夹到 1–15 秒。
  assert.equal(normalizeVideoOptions({ resolution: '720p', duration: 0, aspectRatio: '16:9' }, capabilities).duration, 5)
})
