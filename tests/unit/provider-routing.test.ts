import assert from 'node:assert/strict'
import test from 'node:test'
import {
  orderPlatformRoutes,
  orderPrivateRoutes,
  providerSourceRequirement,
  userCredentialCreditCost
} from '../../server/src/providers/provider-routing.ts'

test('费用承担来源只接受平台或用户密钥', () => {
  assert.equal(providerSourceRequirement('platform'), 'platform')
  assert.equal(providerSourceRequirement('user'), 'user')
  assert.equal(providerSourceRequirement('legacy'), undefined)
  assert.equal(userCredentialCreditCost('user', 12), 0)
  assert.equal(userCredentialCreditCost(undefined, 12), 12)
})

test('私有模型优先级与轮询排序保持稳定', () => {
  const candidates = [
    { value: 'old', priority: 10, weight: 1, createdAt: new Date(1000) },
    { value: 'new', priority: 10, weight: 1, createdAt: new Date(2000) },
    { value: 'low', priority: 5, weight: 1, createdAt: new Date(0) }
  ]
  assert.deepEqual(orderPrivateRoutes(candidates, 'PRIORITY', 0, () => 0.5), ['old', 'new', 'low'])
  assert.deepEqual(orderPrivateRoutes(candidates, 'ROUND_ROBIN', 1, () => 0.5), ['new', 'low', 'old'])
})

test('平台路由先按优先级，再按权重随机分数排序', () => {
  const values = orderPlatformRoutes([
    { value: 'low', priority: 1, weight: 100 },
    { value: 'light', priority: 5, weight: 1 },
    { value: 'heavy', priority: 5, weight: 100 }
  ], () => 0.5)
  assert.deepEqual(values, ['heavy', 'light', 'low'])
})
