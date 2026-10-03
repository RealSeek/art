import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AssetsService } from '../../server/src/assets/assets.service'
import { ObjectStorageService } from '../../server/src/assets/object-storage.service'
import { VideoReferencesController } from '../../server/src/assets/video-references.controller'

test('视频参考素材链接在任务期间可读且重试复用，终态禁用并清理临时副本', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'art-video-reference-'))
  const previousBase = process.env.PUBLIC_BASE_URL
  process.env.PUBLIC_BASE_URL = 'https://art.example'
  const storage = new ObjectStorageService({ get: (key: string, fallback?: unknown) => key === 'UPLOAD_DIR' ? directory : fallback } as never)
  type Reference = { id: string; userId: string; objectKey: string; storageDriver: string; storageBucket: string; name: string; mimeType: string; retentionExempt: boolean; deletedAt?: Date; metadata: { purpose: string; jobId: string; slot: string } }
  const rows: Reference[] = []
  const job = { status: 'RUNNING', errorCode: null as string | null }
  let deleteFails = false
  const prisma = {
    asset: {
      findFirst: async ({ where }: { where: { id?: string; AND?: Array<{ metadata: { path: string[]; equals: string } }> } }) => rows.find((row) => !row.deletedAt && (!where.id || row.id === where.id) && (!where.AND || where.AND.every(({ metadata }) => row.metadata[metadata.path[0] as keyof Reference['metadata']] === metadata.equals))) || null,
      create: async ({ data }: { data: Reference }) => { rows.push(data); return data },
      update: async ({ where, data }: { where: { id: string }; data: { deletedAt: Date } }) => Object.assign(rows.find((row) => row.id === where.id)!, data),
      updateMany: async ({ where }: { where: { id: string } }) => { rows.find((row) => row.id === where.id)!.deletedAt = undefined; return { count: 1 } },
    },
    generationJob: { findFirst: async () => job },
    $queryRaw: async (sql: TemplateStringsArray) => {
      assert.match(sql.join(''), /g.status = 'SUCCEEDED' OR \(g.status IN \('FAILED', 'CANCELLED'\)/)
      assert.match(sql.join(''), /SETTLEMENT_RECONCILIATION_FAILED/)
      return rows.filter((row) => !row.deletedAt && (job.status === 'SUCCEEDED' || ['FAILED', 'CANCELLED'].includes(job.status) && !job.errorCode))
    },
  }
  const realDelete = storage.delete.bind(storage)
  storage.delete = async (location, key) => { if (deleteFails) throw new Error('disk unavailable'); await realDelete(location, key) }
  const assets = new AssetsService(storage, prisma as never, {} as never)
  try {
    const source = 'data:image/png;base64,YQ=='
    const task = { id: 'job-a', userId: 'user-a' }
    const url = await assets.publishVideoReference(task, 'image-0', source)
    const id = url.split('/').at(-1)!
    assert.match(id, /^vref_[a-f0-9]{64}$/)
    assert.equal(await assets.publishVideoReference(task, 'image-0', source), url)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].retentionExempt, true)
    assert.equal((await assets.readVideoReference(id)).file.toString(), 'a')
    assert.equal((await new VideoReferencesController(assets).content(id)).getHeaders().type, 'image/png')
    await assert.rejects(assets.readVideoReference('normal-asset-id'), /不存在/)
    assert.equal((await assets.cleanupVideoReferences()).removed, 0)
    job.status = 'FAILED'
    job.errorCode = 'SETTLEMENT_RECONCILIATION_FAILED'
    assert.equal((await assets.readVideoReference(id)).file.toString(), 'a')
    assert.equal((await assets.cleanupVideoReferences()).removed, 0)
    job.status = 'SUCCEEDED'
    await assert.rejects(assets.readVideoReference(id), /失效/)
    deleteFails = true
    assert.equal((await assets.cleanupVideoReferences()).failures[0].error, 'disk unavailable')
    assert.equal(rows[0].deletedAt, undefined)
    deleteFails = false
    assert.equal((await assets.cleanupVideoReferences()).removed, 1)
    await assert.rejects(storage.read({ driver: 'local', bucket: '' }, rows[0].objectKey), /不存在/)
    await assert.rejects(assets.readVideoReference(id), /不存在/)
    const otherUrl = await assets.publishVideoReference({ id: 'job-b', userId: 'user-a' }, 'image-0', source)
    assert.notEqual(otherUrl, url)
    job.status = 'FAILED'
    job.errorCode = null
    assert.equal((await assets.cleanupVideoReferences()).removed, 1)
  } finally {
    if (previousBase === undefined) delete process.env.PUBLIC_BASE_URL
    else process.env.PUBLIC_BASE_URL = previousBase
    await rm(directory, { recursive: true, force: true })
  }
})
