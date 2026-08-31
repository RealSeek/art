import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { OnModuleInit } from '@nestjs/common'
import { ExportJobStatus } from '@prisma/client'
import { Job } from 'bullmq'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { Queue } from 'bullmq'
import { publicExportGenerationSelect, toPublicExportGeneration } from './public-export-generation.dto'
import { publicAssetMetadata } from '../assets/public-asset.dto'
import { publicMessageMetadata } from '../conversations/public-message.dto'

const EXPORT_DIR = join(process.cwd(), 'storage', 'exports')

@Processor('export', { concurrency: 2 })
export class ExportsProcessor extends WorkerHost implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, @InjectQueue('export') private readonly queue: Queue) { super() }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('export-expiry-cleanup', { every: 60 * 60_000 }, {
      name: 'cleanup', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  private async readBatches<T extends { id: string; createdAt: Date }>(load: (cursor?: { createdAt: Date; id: string }) => Promise<T[]>) {
    const rows: T[] = []
    let cursor: { createdAt: Date; id: string } | undefined
    while (true) {
      const batch = await load(cursor)
      if (!batch.length) break
      rows.push(...batch)
      const last = batch.at(-1)!
      cursor = { createdAt: last.createdAt, id: last.id }
      if (batch.length < 200) break
    }
    return rows
  }

  async process(job: Job<{ exportId: string }>) {
    if (job.name === 'cleanup') {
      const expired = await this.prisma.exportJob.findMany({
        where: { expiresAt: { lt: new Date() }, status: { not: ExportJobStatus.EXPIRED } },
        select: { id: true, filePath: true },
        take: 500,
      })
      for (const row of expired) {
        if (row.filePath) await unlink(row.filePath).catch(() => undefined)
        await this.prisma.exportJob.updateMany({ where: { id: row.id, status: { not: ExportJobStatus.EXPIRED } }, data: { status: ExportJobStatus.EXPIRED } })
      }
      return { expired: expired.length }
    }
    const claimed = await this.prisma.exportJob.updateMany({ where: { id: job.data.exportId, status: ExportJobStatus.QUEUED, expiresAt: { gt: new Date() } }, data: { status: ExportJobStatus.RUNNING, startedAt: new Date(), error: '' } })
    if (!claimed.count) return
    try {
      const exportJob = await this.prisma.exportJob.findUniqueOrThrow({ where: { id: job.data.exportId } })
      const userIds = exportJob.scope === 'TEAM' && exportJob.teamId
        ? (await this.prisma.teamMember.findMany({ where: { teamId: exportJob.teamId }, select: { userId: true } })).map((item) => item.userId)
        : [exportJob.userId]
      const [account, team] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: exportJob.userId }, select: { id: true, email: true, displayName: true, createdAt: true, settings: true } }),
        exportJob.teamId ? this.prisma.team.findUnique({ where: { id: exportJob.teamId }, select: { id: true, name: true, slug: true, createdAt: true } }) : null,
      ])
      const conversations: unknown[] = []
      let conversationCursor: { createdAt: Date; id: string } | undefined
      while (true) {
        const rows = await this.prisma.conversation.findMany({ where: { userId: { in: userIds }, temporary: false, ...(conversationCursor ? { OR: [{ createdAt: { gt: conversationCursor.createdAt } }, { createdAt: conversationCursor.createdAt, id: { gt: conversationCursor.id } }] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200, select: { id: true, title: true, model: true, projectId: true, temporary: true, createdAt: true, updatedAt: true } })
        if (!rows.length) break
        const messages = await this.prisma.message.findMany({ where: { conversationId: { in: rows.map((row) => row.id) }, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, conversationId: true, role: true, content: true, model: true, metadata: true, createdAt: true } })
        const byConversation = new Map<string, unknown[]>()
        for (const message of messages) { const list = byConversation.get(message.conversationId) || []; list.push({ id: message.id, role: message.role, content: message.content, model: message.model, metadata: publicMessageMetadata(message.metadata), createdAt: message.createdAt }); byConversation.set(message.conversationId, list) }
        conversations.push(...rows.map((row) => ({ ...row, messages: byConversation.get(row.id) || [] })))
        conversationCursor = rows.at(-1)
        if (rows.length < 200) break
      }
      const projectWhere = exportJob.teamId ? { teamId: exportJob.teamId } : { userId: exportJob.userId }
      const assetWhere = exportJob.teamId ? { teamId: exportJob.teamId, deletedAt: null } : { userId: exportJob.userId, deletedAt: null }
      const generationWhere = exportJob.teamId ? { OR: [{ billingTeamId: exportJob.teamId }, { userId: { in: userIds } }] } : { userId: exportJob.userId }
      const [projects, assets, generations] = await Promise.all([
        this.readBatches((cursor) => this.prisma.project.findMany({ where: { ...projectWhere, ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200, select: { id: true, name: true, description: true, instructions: true, archivedAt: true, createdAt: true, updatedAt: true } })),
        this.readBatches((cursor) => this.prisma.asset.findMany({ where: { ...assetWhere, ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200, select: { id: true, projectId: true, teamId: true, kind: true, name: true, mimeType: true, size: true, width: true, height: true, metadata: true, createdAt: true } })),
        this.readBatches((cursor) => this.prisma.generationJob.findMany({ where: { ...generationWhere, ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200, select: publicExportGenerationSelect })),
      ])
      await mkdir(EXPORT_DIR, { recursive: true })
      const fileName = 'xinyue-export-' + exportJob.id + '.json'
      const filePath = join(EXPORT_DIR, fileName)
      const payload = { exportedAt: new Date().toISOString(), scope: exportJob.scope, account, team, conversations, projects, assets: assets.map((asset) => ({ ...asset, size: Number(asset.size), metadata: publicAssetMetadata(asset.metadata) })), generations: generations.map(toPublicExportGeneration) }
      await writeFile(filePath, JSON.stringify(payload, (_key, value) => typeof value === 'bigint' ? Number(value) : value), 'utf8')
      const finalized = await this.prisma.exportJob.updateMany({ where: { id: exportJob.id, status: ExportJobStatus.RUNNING, expiresAt: { gt: new Date() } }, data: { status: ExportJobStatus.SUCCEEDED, fileName, filePath, completedAt: new Date() } })
      if (!finalized.count) await unlink(filePath).catch(() => undefined)
    } catch (error) {
      await this.prisma.exportJob.updateMany({ where: { id: job.data.exportId, status: ExportJobStatus.RUNNING }, data: { status: ExportJobStatus.FAILED, error: error instanceof Error ? error.message.slice(0, 4000) : '导出失败', completedAt: new Date() } })
      throw error
    }
  }
}
