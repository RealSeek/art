import assert from 'node:assert/strict'
import test from 'node:test'
import { FeatureFlagsService } from '../../server/src/features/feature-flags.service'

function serviceWith(flag: unknown) {
  return new FeatureFlagsService({ featureFlag: { findUnique: async () => flag } } as never)
}

test('Feature Flag 不存在时沿用调用方设置', async () => {
  assert.equal(await serviceWith(null).resolve('generation.image_prompt_extraction', true, 'user-1'), true)
  assert.equal(await serviceWith(null).resolve('generation.image_prompt_extraction', false, 'user-1'), false)
})

test('全局 Feature Flag 明确覆盖旧设置', async () => {
  assert.equal(await serviceWith({ scope: 'GLOBAL', enabled: false, userIds: [] }).resolve('key', true, 'user-1'), false)
  assert.equal(await serviceWith({ scope: 'GLOBAL', enabled: true, userIds: [] }).resolve('key', false, 'user-1'), true)
})

test('用户级 Feature Flag 只对白名单用户启用', async () => {
  const service = serviceWith({ scope: 'USER', enabled: true, userIds: ['user-1'] })
  assert.equal(await service.resolve('key', true, 'user-1'), true)
  assert.equal(await service.resolve('key', true, 'user-2'), false)
})
