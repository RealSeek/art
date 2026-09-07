import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { AssetKind, Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { ResourceAccessService } from '../common/resource-access.service'
import { ObjectStorageService, type StorageLocation } from './object-storage.service'
import type sharpFactory from 'sharp'

const sharp = require('sharp') as typeof sharpFactory

type StoredFile = {
  stream: NodeJS.ReadableStream
  name: string
  mimeType: string
  kind: AssetKind
  projectId?: string
  teamId?: string
  metadata?: Record<string, unknown>
}

const rasterMimeByExtension: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
const inlineMimeTypes = new Set(Object.values(rasterMimeByExtension))
inlineMimeTypes.add('video/mp4')
inlineMimeTypes.add('video/webm')
inlineMimeTypes.add('video/quicktime')
const rasterMimeTypes = new Set(Object.values(rasterMimeByExtension))
const videoMimeByExtension: Record<string, string> = { '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.webm': 'video/webm' }
const videoMimeTypes = new Set(Object.values(videoMimeByExtension))
const mediaKinds = new Set<AssetKind>([AssetKind.IMAGE, AssetKind.VIDEO, AssetKind.PRODUCT_PACK])
const permanentPurposes = new Set(['chat-home-banner', 'tool-icon', 'inspiration-cover', 'inspiration-preview-video', 'inspiration-preview-image'])

export function resolveRasterImageMime(name: string, suppliedMimeType: string) {
  return rasterMimeByExtension[extname(name).toLowerCase()] || (rasterMimeTypes.has(suppliedMimeType.toLowerCase()) ? suppliedMimeType.toLowerCase() : null)
}

export function resolveVideoMime(name: string, suppliedMimeType: string) {
  return videoMimeByExtension[extname(name).toLowerCase()] || (videoMimeTypes.has(suppliedMimeType.toLowerCase()) ? suppliedMimeType.toLowerCase() : null)
}

export function assetDisposition(mimeType: string, name: string) {
  const mode = inlineMimeTypes.has(mimeType.toLowerCase()) ? 'inline' : 'attachment'
  return `${mode}; filename*=UTF-8''${encodeURIComponent(name)}`
}

@Injectable()
export class AssetsService {
  constructor(private readonly storage: ObjectStorageService, private readonly prisma: PrismaService, private readonly access: ResourceAccessService) {}

  private makeObjectKey(userId: string, name: string, generated = false) {
    const extension = extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12)
    const folder = generated ? 'generated' : 'uploads'
    return join('users', userId, folder, new Date().toISOString().slice(0, 10), `${randomUUID()}${extension}`).replaceAll('\\', '/')
  }

  private assetLocation(asset: { storageDriver: string; storageBucket: string }): StorageLocation {
    if (asset.storageDriver !== 'local' && asset.storageDriver !== 's3') throw new ServiceUnavailableException('文件存储驱动无效')
    return { driver: asset.storageDriver, bucket: asset.storageBucket }
  }

  private async resolveTeamId(userId: string, projectId?: string, requestedTeamId?: string) {
    if (projectId) {
      const project = await this.access.projectAccess(userId, projectId, false)
      if (requestedTeamId && requestedTeamId !== project.teamId) throw new BadRequestException('文件团队必须与项目团队一致')
      return project.teamId || undefined
    }
    if (requestedTeamId) await this.access.assertTeamMember(requestedTeamId, userId)
    return requestedTeamId
  }

  async storeUpload(userId: string, input: StoredFile) {
    try {
      input.teamId = await this.resolveTeamId(userId, input.projectId, input.teamId)
    } catch (error) {
      input.stream.resume()
      throw error
    }
    const objectKey = this.makeObjectKey(userId, input.name)
    const location = this.storage.activeLocation()
    try {
      const source = input.mimeType.startsWith('image/') ? await this.optimizeImage(await this.readUpload(input.stream), input.mimeType) : null
      const stored = source ? await this.storage.putBytes(objectKey, source, input.mimeType) : await this.storage.putStream(objectKey, input.stream, input.mimeType)
      const retention = await this.assetRetention(input.kind, input.metadata)
      return await this.prisma.asset.create({
        data: {
          userId,
          projectId: input.projectId,
          teamId: input.teamId,
          objectKey,
          storageDriver: location.driver,
          storageBucket: location.bucket,
          name: input.name.slice(0, 255),
          mimeType: input.mimeType,
          kind: input.kind,
          size: BigInt(stored.size),
          checksum: stored.checksum,
          expiresAt: retention.expiresAt,
          retentionExempt: retention.retentionExempt,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      })
    } catch (error) {
      await this.storage.delete(location, objectKey).catch(() => undefined)
      throw error
    }
  }

  async storeGenerated(userId: string, data: Uint8Array, input: { name: string; mimeType: string; kind: AssetKind; projectId?: string; teamId?: string; metadata?: Record<string, unknown> }) {
    const teamId = await this.resolveTeamId(userId, input.projectId, input.teamId)
    const namedExtension = extname(input.name).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12)
    const extension = input.mimeType === 'image/png' ? '.png' : input.mimeType === 'image/webp' ? '.webp' : input.mimeType === 'image/gif' ? '.gif' : input.mimeType === 'image/avif' ? '.avif' : input.mimeType === 'image/svg+xml' ? '.svg' : input.mimeType === 'video/webm' ? '.webm' : input.mimeType === 'video/quicktime' ? '.mov' : input.mimeType.startsWith('video/') ? '.mp4' : namedExtension || '.bin'
    const fileName = input.name.toLowerCase().endsWith(extension) ? input.name : `${input.name}${extension}`
    const objectKey = this.makeObjectKey(userId, fileName, true)
    const location = this.storage.activeLocation()
    const source = input.mimeType.startsWith('image/') ? await this.optimizeImage(data, input.mimeType) : data
    try {
      const stored = await this.storage.putBytes(objectKey, source, input.mimeType)
      const retention = await this.assetRetention(input.kind, input.metadata)
      return await this.prisma.asset.create({ data: { userId, projectId: input.projectId, teamId, objectKey, storageDriver: location.driver, storageBucket: location.bucket, name: input.name, mimeType: input.mimeType, kind: input.kind, size: BigInt(stored.size), checksum: stored.checksum, expiresAt: retention.expiresAt, retentionExempt: retention.retentionExempt, metadata: input.metadata as Prisma.InputJsonValue | undefined } })
    } catch (error) {
      await this.storage.delete(location, objectKey).catch(() => undefined)
      throw error
    }
  }

  async readForUser(userId: string, id: string) {
    const asset = await this.access.assertAssetReadable(userId, id)
    return this.readAsset(asset)
  }

  async readForAdmin(id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, deletedAt: null } })
    if (!asset) throw new NotFoundException('文件不存在')
    return this.readAsset(asset)
  }

  async readPublicChatHomeImage(id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        deletedAt: null,
        kind: AssetKind.IMAGE,
        metadata: { path: ['purpose'], equals: 'chat-home-banner' },
      },
    })
    if (!asset) throw new NotFoundException('首页图片不存在')
    return this.readAsset(asset)
  }

  private async readAsset(asset: { objectKey: string; storageDriver: string; storageBucket: string; mimeType: string; name: string; kind?: AssetKind }) {
    const file = await this.storage.read(this.assetLocation(asset), asset.objectKey)
    return { file, mimeType: asset.mimeType, name: asset.name, kind: asset.kind }
  }

  async remove(userId: string, id: string) {
    const asset = await this.access.assertAssetManager(userId, id)
    await this.removeStoredAsset(asset)
    return { deleted: true }
  }

  private async readUpload(stream: NodeJS.ReadableStream) {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength
      if (size > 50 * 1024 * 1024) throw new BadRequestException('鏂囦欢涓嶈兘瓒呰繃 50 MB')
      chunks.push(Buffer.from(chunk))
    }
    if (!size) throw new BadRequestException('鏂囦欢鍐呭涓虹┖')
    return Buffer.concat(chunks, size)
  }

  private async optimizeImage(data: Uint8Array, mimeType: string) {
    if (!['image/png', 'image/webp', 'image/avif'].includes(mimeType)) return data
    try {
      const image = sharp(data, { animated: true, limitInputPixels: 100_000_000 })
      const optimized = mimeType === 'image/png'
        ? await image.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 6 }).toBuffer()
        : mimeType === 'image/webp'
          ? await image.webp({ lossless: true, effort: 5, exact: true }).toBuffer()
          : await image.avif({ lossless: true, effort: 4 }).toBuffer()
      return optimized.byteLength < data.byteLength ? optimized : data
    } catch {
      throw new BadRequestException('鍥剧墖鍐呭鏃犳晥鎴栨牸寮忔棤娉曞鐞?')
    }
  }

  private async assetRetention(kind: AssetKind, metadata?: Record<string, unknown>) {
    if (!mediaKinds.has(kind)) return { expiresAt: null, retentionExempt: false }
    const purpose = typeof metadata?.purpose === 'string' ? metadata.purpose : ''
    if (permanentPurposes.has(purpose)) return { expiresAt: null, retentionExempt: true }
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'global' }, select: { mediaRetentionDays: true } })
    const days = setting?.mediaRetentionDays === 7 ? 7 : 30
    return { expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000), retentionExempt: false }
  }

  async applyMediaRetention(days: 7 | 30) {
    const result = await this.prisma.$executeRaw`UPDATE "Asset" SET "expiresAt" = "createdAt" + (${days} * INTERVAL '1 day') WHERE "retentionExempt" = false AND "deletedAt" IS NULL AND "kind" IN ('IMAGE', 'VIDEO', 'PRODUCT_PACK')`
    return Number(result)
  }

  async cleanupExpired(limit = 500) {
    const rows = await this.prisma.asset.findMany({ where: { expiresAt: { lte: new Date() }, deletedAt: null, retentionExempt: false, kind: { in: [AssetKind.IMAGE, AssetKind.VIDEO, AssetKind.PRODUCT_PACK] } }, orderBy: { expiresAt: 'asc' }, take: limit })
    let removed = 0
    const failures: Array<{ id: string; error: string }> = []
    for (const row of rows) {
      try { await this.removeStoredAsset(row); removed++ } catch (error) { failures.push({ id: row.id, error: error instanceof Error ? error.message : '文件清理失败' }) }
    }
    return { scanned: rows.length, removed, failures }
  }

  async assignTeam(userId: string, id: string, teamId: string | null) {
    const asset = await this.access.assertAssetManager(userId, id)
    if (asset.projectId) throw new BadRequestException('项目文件的团队归属由项目统一管理')
    if (teamId) await this.access.assertTeamManager(teamId, userId)
    const updated = await this.prisma.asset.update({ where: { id }, data: { teamId } })
    if (asset.teamId && asset.teamId !== teamId) await this.access.auditTeamResource(asset.teamId, userId, 'asset.unassigned', 'asset', id)
    if (teamId && teamId !== asset.teamId) await this.access.auditTeamResource(teamId, userId, 'asset.assigned', 'asset', id, { previousTeamId: asset.teamId })
    return updated
  }

  async removeAsAdmin(id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, deletedAt: null } })
    if (!asset) throw new NotFoundException('文件不存在')
    await this.removeStoredAsset(asset)
    return { deleted: true }
  }

  private async removeStoredAsset(asset: { id: string; objectKey: string; storageDriver: string; storageBucket: string }) {
    const deletedAt = new Date()
    await this.prisma.asset.update({ where: { id: asset.id }, data: { deletedAt } })
    try {
      await this.storage.delete(this.assetLocation(asset), asset.objectKey)
    } catch (error) {
      await this.prisma.asset.updateMany({ where: { id: asset.id, deletedAt }, data: { deletedAt: null } })
      throw error
    }
  }

  async purgePersonalAssets(userId: string) {
    const assets = await this.prisma.asset.findMany({
      where: { userId, teamId: null },
      select: { objectKey: true, storageDriver: true, storageBucket: true },
    })
    const results = await Promise.allSettled(assets.map((asset) => this.storage.delete(this.assetLocation(asset), asset.objectKey)))
    return { total: assets.length, removed: results.filter((item) => item.status === 'fulfilled').length }
  }

  async health() {
    return this.storage.health()
  }

  lifecycleStatus() { return this.storage.lifecycleStatus() }
  applyLifecycle() { return this.storage.applyLifecycle() }

  async migrationStatus() {
    const target = this.storage.activeLocation()
    const pendingWhere = this.pendingMigrationWhere(target)
    const [total, pending, locations] = await Promise.all([
      this.prisma.asset.aggregate({ where: { deletedAt: null }, _count: { _all: true }, _sum: { size: true } }),
      this.prisma.asset.aggregate({ where: pendingWhere, _count: { _all: true }, _sum: { size: true } }),
      this.prisma.asset.groupBy({ by: ['storageDriver', 'storageBucket'], where: { deletedAt: null }, _count: { _all: true }, _sum: { size: true }, orderBy: { storageDriver: 'asc' } }),
    ])
    return {
      target,
      total: { count: total._count._all, bytes: Number(total._sum.size || 0) },
      pending: { count: pending._count._all, bytes: Number(pending._sum.size || 0) },
      locations: locations.map((item) => ({ driver: item.storageDriver, bucket: item.storageBucket, count: item._count._all, bytes: Number(item._sum.size || 0) })),
    }
  }

  async migrateToActive(limit = 25) {
    const target = this.storage.activeLocation()
    await this.storage.health()
    const assets = await this.prisma.asset.findMany({
      where: this.pendingMigrationWhere(target),
      orderBy: { id: 'asc' },
      take: Math.max(1, Math.min(100, limit)),
      select: { id: true, objectKey: true, storageDriver: true, storageBucket: true, mimeType: true, name: true, size: true, checksum: true },
    })
    const migrated: string[] = []
    const failed: Array<{ id: string; name: string; message: string }> = []
    const warnings: Array<{ id: string; message: string }> = []

    for (const asset of assets) {
      const source = this.assetLocation(asset)
      try {
        const data = await this.storage.read(source, asset.objectKey)
        if (BigInt(data.byteLength) !== asset.size) throw new ConflictException('源文件大小与数据库记录不一致')
        const checksum = createHash('sha256').update(data).digest('hex')
        if (asset.checksum && asset.checksum !== checksum) throw new ConflictException('源文件校验和与数据库记录不一致')

        try {
          const existing = await this.storage.read(target, asset.objectKey)
          const existingChecksum = createHash('sha256').update(existing).digest('hex')
          if (existing.byteLength !== data.byteLength || existingChecksum !== checksum) throw new ConflictException('目标存储已存在同名但内容不同的文件')
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error
          await this.storage.putBytesAt(target, asset.objectKey, data, asset.mimeType)
        }

        const updated = await this.prisma.asset.updateMany({
          where: { id: asset.id, storageDriver: asset.storageDriver, storageBucket: asset.storageBucket },
          data: { storageDriver: target.driver, storageBucket: target.bucket, checksum },
        })
        if (!updated.count) throw new ConflictException('资产记录已被其他迁移任务更新')
        migrated.push(asset.id)
        try { await this.storage.delete(source, asset.objectKey) } catch (error) {
          warnings.push({ id: asset.id, message: error instanceof Error ? error.message : '旧文件清理失败' })
        }
      } catch (error) {
        failed.push({ id: asset.id, name: asset.name, message: error instanceof Error ? error.message : '迁移失败' })
      }
    }

    return { target, attempted: assets.length, migrated: migrated.length, failed, warnings, status: await this.migrationStatus() }
  }

  private pendingMigrationWhere(target: StorageLocation): Prisma.AssetWhereInput {
    return { deletedAt: null, NOT: [{ storageDriver: target.driver, storageBucket: target.bucket }] }
  }
}
