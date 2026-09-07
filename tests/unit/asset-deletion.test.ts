import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetsService } from '../../server/src/assets/assets.service'

test('generated media receives the configured seven-day retention', async () => {
  let created: Record<string, unknown> | undefined
  const service = new AssetsService(
    {
      activeLocation: () => ({ driver: 'local', bucket: '' }),
      putBytes: async (_key: string, data: Uint8Array) => ({ size: data.byteLength, checksum: 'checksum' }),
      delete: async () => undefined,
    } as never,
    {
      systemSetting: { findUnique: async () => ({ mediaRetentionDays: 7 }) },
      asset: { create: async (input: { data: Record<string, unknown> }) => { created = input.data; return input.data } },
    } as never,
    {} as never,
  )

  const startedAt = Date.now()
  await service.storeGenerated('user-1', new Uint8Array([1, 2, 3]), {
    name: 'result.jpg',
    mimeType: 'image/jpeg',
    kind: 'IMAGE' as never,
  })

  const expiresAt = created?.expiresAt
  assert.ok(expiresAt instanceof Date)
  assert.equal(created?.retentionExempt, false)
  assert.ok(expiresAt.getTime() >= startedAt + 7 * 86_400_000)
  assert.ok(expiresAt.getTime() <= Date.now() + 7 * 86_400_000)
})

test('asset remains visible when stored file deletion fails', async () => {
  const updates: Array<Record<string, unknown>> = []
  const asset = { id: 'asset-1', objectKey: 'users/user-1/uploads/file.txt', storageDriver: 'local', storageBucket: '' }
  const service = new AssetsService(
    { delete: async () => { throw new Error('disk unavailable') } } as never,
    {
      asset: {
        findFirst: async () => asset,
        update: async (input: { data: Record<string, unknown> }) => { updates.push(input.data) },
        updateMany: async (input: { data: Record<string, unknown> }) => { updates.push(input.data); return { count: 1 } },
      },
    } as never,
    {} as never,
  )

  await assert.rejects(() => service.removeAsAdmin(asset.id), /disk unavailable/)
  assert.ok(updates[0]?.deletedAt instanceof Date)
  assert.deepEqual(updates[1], { deletedAt: null })
})
