import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetsService } from '../../server/src/assets/assets.service'

const service = (mediaRetentionDays?: number) => new AssetsService({} as never, {
  systemSetting: { findUnique: async () => (mediaRetentionDays === undefined ? null : { mediaRetentionDays }) },
} as never, {} as never)

const daysBetween = (expiresAt: Date | null) => expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / 86_400_000) : null

test('媒体默认只在服务器保留 1 天', async () => {
  assert.equal(daysBetween((await (service(undefined) as never as { assetRetention: (kind: string, metadata: Record<string, unknown>) => Promise<{ expiresAt: Date | null }> }).assetRetention('IMAGE', { purpose: 'generated' })).expiresAt), 1)
  assert.equal(daysBetween((await (service(1) as never as { assetRetention: (kind: string, metadata: Record<string, unknown>) => Promise<{ expiresAt: Date | null }> }).assetRetention('IMAGE', { purpose: 'generated' })).expiresAt), 1)
  assert.equal(daysBetween((await (service(7) as never as { assetRetention: (kind: string, metadata: Record<string, unknown>) => Promise<{ expiresAt: Date | null }> }).assetRetention('VIDEO', { purpose: 'generated' })).expiresAt), 7)
  assert.equal(daysBetween((await (service(30) as never as { assetRetention: (kind: string, metadata: Record<string, unknown>) => Promise<{ expiresAt: Date | null }> }).assetRetention('VIDEO', { purpose: 'generated' })).expiresAt), 30)
})

test('非法保留天数回退到 1 天，永久用途不受保留期影响', async () => {
  assert.equal(daysBetween((await (service(0) as never as { assetRetention: (kind: string, metadata: Record<string, unknown>) => Promise<{ expiresAt: Date | null }> }).assetRetention('IMAGE', { purpose: 'generated' })).expiresAt), 1)
  const permanent = await (service(1) as never as { assetRetention: (kind: string, metadata: Record<string, unknown>) => Promise<{ expiresAt: Date | null; retentionExempt: boolean }> }).assetRetention('IMAGE', { purpose: 'inspiration-cover' })
  assert.equal(permanent.expiresAt, null)
  assert.equal(permanent.retentionExempt, true)
  // 非媒体类型（文档、音频）不参与媒体过期
  assert.equal((await (service(1) as never as { assetRetention: (kind: string, metadata: Record<string, unknown>) => Promise<{ expiresAt: Date | null }> }).assetRetention('AUDIO', { purpose: 'reference' })).expiresAt, null)
})
