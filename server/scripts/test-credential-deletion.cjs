const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { ProvidersService } = require('../dist/providers/providers.service')

const prisma = new PrismaClient()
const marker = `credential-deletion-${randomUUID()}`
const rollback = new Error('回滚密钥删除回归测试')

async function main() {
  // 使用真实外键和业务方法验证，所有临时记录只存在于回滚事务中。
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { displayName: marker } })
      const otherUser = await tx.user.create({ data: { displayName: `${marker}-other` } })
      const createKey = (userId, name) => tx.userApiCredential.create({ data: {
        userId, name, providerType: 'NEW_API', baseUrl: 'https://ai.realseek.wiki/v1', encryptedApiKey: '', apiKeyHint: '',
      } })
      const oldKey = await createKey(user.id, '旧密钥')
      const newKey = await createKey(user.id, '新密钥')
      const otherKey = await createKey(otherUser.id, '其他用户密钥')
      const createModel = (key, credentialIds, isDefault = false, capability = 'CHAT') => tx.userModel.create({ data: {
        userId: user.id, key, displayName: key, capability, isDefault,
        routes: { create: credentialIds.map((credentialId) => ({ credentialId, upstreamModel: key })) },
      } })
      const oldDefault = await createModel('old-default', [oldKey.id], true)
      const shared = await createModel('shared', [oldKey.id, newKey.id])
      const imageDefault = await createModel('image-default', [oldKey.id], true, 'IMAGE')
      const unrelated = await createModel('unrelated-orphan', [])
      const service = new ProvidersService({
        ...tx,
        $transaction: (work) => work(tx),
      }, {}, {}, {}, {}, {}, {}, {})

      await assert.rejects(() => service.deleteCredential(user.id, otherKey.id), /API 凭据不存在/)
      assert(await tx.userApiCredential.findUnique({ where: { id: otherKey.id } }))
      assert.equal(await tx.userModelRoute.count({ where: { credentialId: oldKey.id } }), 3)

      await service.deleteCredential(user.id, oldKey.id)
      assert.equal(await tx.userModel.count({ where: { id: { in: [oldDefault.id, imageDefault.id] } } }), 0)
      assert(await tx.userModel.findUnique({ where: { id: unrelated.id } }))
      const remaining = await tx.userModel.findUnique({ where: { id: shared.id }, include: { routes: true } })
      assert.equal(remaining.routes.length, 1)
      assert.equal(remaining.routes[0].credentialId, newKey.id)
      assert.equal(remaining.isDefault, true)
      assert.equal(await tx.userModel.count({ where: { userId: user.id, capability: 'IMAGE', isDefault: true } }), 0)
      console.log('通过：删除唯一绑定模型、保留共享模型、切换同类默认模型、保留无关模型、用户隔离')

      const extraKey = await createKey(user.id, '共享备用密钥')
      await tx.userModelRoute.create({ data: { userModelId: shared.id, credentialId: extraKey.id, upstreamModel: 'shared' } })
      await service.deleteCredential(user.id, extraKey.id)
      assert.equal((await tx.userModel.findUnique({ where: { id: shared.id } })).isDefault, true)
      await service.deleteCredential(user.id, newKey.id)
      assert.equal(await tx.userModel.count({ where: { id: shared.id } }), 0)
      assert.equal(await tx.userModel.count({ where: { userId: user.id, isDefault: true } }), 0)
      assert.equal(await tx.userApiCredential.count({ where: { userId: user.id } }), 0)
      console.log('通过：共享模型保留默认标记，删除最后一把密钥后不残留失效默认模型')

      const reconnected = await createKey(user.id, '重新接入密钥')
      service.userPolicy = async () => ({ allowUserByok: true })
      service.discoverCredentialModels = async () => ({ models: ['gpt-5.4'], candidates: [{
        id: 'gpt-5.4', displayName: 'Gpt 5.4', capability: 'CHAT', importable: true, vendorKey: marker, vendorName: marker,
      }] })
      await service.importCredentialModels(user.id, reconnected.id, { importAll: true })
      const imported = await tx.userModel.findFirst({ where: { userId: user.id, isDefault: true, capability: 'CHAT' }, include: { routes: true } })
      assert(imported)
      assert.equal(imported.routes.length, 1)
      assert.equal(imported.routes[0].credentialId, reconnected.id)
      assert.equal(imported.routes[0].upstreamModel, 'gpt-5.4')
      console.log('通过：删除后重新接入密钥，导入模型重新获得有效默认路由')
      throw rollback
    }, { isolationLevel: 'Serializable', timeout: 15000 })
  } catch (error) {
    if (error !== rollback) throw error
  }
  assert.equal(await prisma.user.count({ where: { displayName: { startsWith: marker } } }), 0)
  console.log('通过：测试事务已全部回滚，无临时用户、密钥或模型残留')
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
