import assert from 'node:assert/strict'
import test from 'node:test'
import { ProvidersService } from '../../server/src/providers/providers.service'
import { providerSourceRequirement } from '../../server/src/providers/provider-routing'

test('私有模型区分无路由、密钥不可用和地址校验失败', async () => {
  const model = { key: 'private:test', routes: [] as Array<Record<string, unknown>> }
  const prisma = {
    systemSetting: { findUnique: async () => ({}) },
    userModel: { findFirst: async () => model },
    modelPreset: { findFirst: async () => null },
  }
  const service = new ProvidersService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, { sourceRequirement: providerSourceRequirement } as never, {} as never)
  service.userPolicy = (async () => ({ allowUserByok: true })) as typeof service.userPolicy
  let addressChecks = 0
  service.assertUserProviderUrl = async () => { addressChecks += 1; throw new Error('地址校验失败') }

  await assert.rejects(() => service.resolveCandidates('user', 'private:test', 'CHAT'), /未绑定可用的密钥路由/)
  for (const credential of [
    { enabled: false },
    { enabled: true, expiresAt: new Date(0) },
    { enabled: true, cooldownUntil: new Date(Date.now() + 60_000) },
  ]) {
    model.routes = [{ upstreamModel: 'test', credential }]
    await assert.rejects(() => service.resolveCandidates('user', 'private:test', 'CHAT'), /已停用、过期或暂时冷却/)
  }
  model.routes = [{ upstreamModel: 'test', credential: { enabled: true }, cooldownUntil: new Date(Date.now() + 60_000) }]
  await assert.rejects(() => service.resolveCandidates('user', 'private:test', 'CHAT'), /已停用、过期或暂时冷却/)
  assert.equal(addressChecks, 0)
  model.routes = [{ upstreamModel: 'test', credential: { enabled: true, baseUrl: 'https://invalid.example/v1' } }]
  await assert.rejects(() => service.resolveCandidates('user', 'private:test', 'CHAT'), /没有安全可用的公网密钥地址/)
  assert.equal(addressChecks, 1)
})
