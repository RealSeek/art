import assert from 'node:assert/strict'
import test from 'node:test'
import { toPublicAsset } from '../../server/src/assets/public-asset.dto'

const now = new Date('2026-08-31T00:00:00.000Z')

test('public asset mapper excludes storage, ownership, deletion, and internal metadata fields', () => {
  const internalAsset = {
    id: 'asset-public',
    userId: 'user-secret',
    projectId: 'project-1',
    teamId: null,
    kind: 'IMAGE' as const,
    name: 'output.png',
    objectKey: 'users/user-secret/generated/output.png',
    storageDriver: 's3',
    storageBucket: 'private-bucket',
    mimeType: 'image/png',
    size: 42n,
    width: 1024,
    height: 1024,
    checksum: 'checksum-secret',
    metadata: {
      purpose: 'generated',
      prompt: 'safe prompt',
      jobId: 'job-public',
      options: { size: '1024x1024', providerAttempts: [{ providerId: 'provider-secret' }], billing: { quotaId: 'quota-secret' } },
      providerId: 'provider-secret',
      credentialId: 'credential-secret',
    },
    deletedAt: null,
    createdAt: now,
  }
  const result = toPublicAsset(internalAsset)

  assert.deepEqual(result, {
    id: 'asset-public',
    projectId: 'project-1',
    teamId: null,
    kind: 'IMAGE',
    name: 'output.png',
    mimeType: 'image/png',
    size: 42,
    width: 1024,
    height: 1024,
    metadata: {
      purpose: 'generated',
      prompt: 'safe prompt',
      jobId: 'job-public',
      options: { size: '1024x1024' },
    },
    createdAt: now,
    contentUrl: '/v1/assets/asset-public/content',
  })
  assert.doesNotMatch(JSON.stringify(result), /user-secret|private-bucket|checksum-secret|provider-secret|credential-secret|quota-secret/)
})
