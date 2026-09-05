import assert from 'node:assert/strict'
import test from 'node:test'
import { ProvidersService } from '../../server/src/providers/providers.service'
import { providerSourceRequirement } from '../../server/src/providers/provider-routing'

test('限定个人渠道时保留明确选择的个人模型及其视频规格', async () => {
  const service = new ProvidersService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { sourceRequirement: providerSourceRequirement } as never, {} as never)
  const calls: unknown[] = []
  const selected = { model: '[c]MiniMaxH3-480p', videoCapabilities: { resolutions: ['480p'] } }
  const fallback = { model: 'seedance-2.0' }
  ;(service as any).resolvePrivateCandidates = async (_userId: string, model: unknown) => {
    calls.push(model)
    return [model ? selected : fallback]
  }
  assert.equal(await service.resolve('user', 'private:minimax', 'VIDEO', { providerSource: 'user' }), selected)
  assert.equal(await service.resolve('user', undefined, 'VIDEO', { providerSource: 'user' }), fallback)
  assert.equal(await service.resolve('user', 'platform-model', 'CHAT', { providerSource: 'user' }), fallback)
  assert.deepEqual(calls, ['private:minimax', undefined, undefined])
})

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
