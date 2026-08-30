import { Injectable } from '@nestjs/common'
import { AssetKind, GenerationJob } from '@prisma/client'
import { AssetsService } from '../assets/assets.service'
import { PrismaService } from '../prisma/prisma.service'

type OutputInput = {
  data: Uint8Array
  name: string
  mimeType: string
  kind: AssetKind
  position?: number
  projectId?: string
  teamId?: string
  metadata?: Record<string, unknown>
}

/** Owns the durable side effects produced by generation runners. */
@Injectable()
export class GenerationOutputService {
  constructor(private readonly assets: AssetsService, private readonly prisma: PrismaService) {}

  async storeAndLink(task: GenerationJob, input: OutputInput) {
    await this.assertActiveLease(task)
    const asset = await this.assets.storeGenerated(task.userId, input.data, {
      projectId: input.projectId ?? task.projectId ?? undefined,
      teamId: input.teamId,
      name: input.name,
      mimeType: input.mimeType,
      kind: input.kind,
      metadata: input.metadata,
    })
    try {
      await this.assertActiveLease(task)
      await this.prisma.jobOutput.create({
        data: { jobId: task.id, assetId: asset.id, position: input.position ?? 0 },
      })
    } catch (error) {
      await this.assets.remove(task.userId, asset.id).catch(() => undefined)
      throw error
    }
    return asset
  }

  async linkExisting(task: GenerationJob, assetId: string, position = 0) {
    await this.assertActiveLease(task)
    return this.prisma.jobOutput.upsert({
      where: { jobId_assetId: { jobId: task.id, assetId } },
      create: { jobId: task.id, assetId, position },
      update: { position },
    })
  }

  async cleanup(
    task: Pick<GenerationJob, 'id' | 'userId'> & Partial<Pick<GenerationJob, 'lockedBy' | 'leaseVersion'>>,
    options: { requireActiveLease?: boolean } = {},
  ) {
    if (options.requireActiveLease) {
      if (task.lockedBy === undefined || task.leaseVersion === undefined) throw new Error('Generation worker lease is missing')
      await this.assertActiveLease(task as Pick<GenerationJob, 'id' | 'lockedBy' | 'leaseVersion'>)
    }
    const outputs = await this.prisma.jobOutput.findMany({ where: { jobId: task.id }, select: { assetId: true } })
    for (const output of outputs) await this.assets.remove(task.userId, output.assetId).catch(() => undefined)
    if (outputs.length) await this.prisma.jobOutput.deleteMany({ where: { jobId: task.id } })
    return outputs.length
  }

  private async assertActiveLease(task: Pick<GenerationJob, 'id' | 'lockedBy' | 'leaseVersion'>) {
    if (!task.lockedBy) throw new Error('Generation worker lease is missing')
    const active = await this.prisma.generationJob.findFirst({
      where: {
        id: task.id,
        status: 'RUNNING',
        lockedBy: task.lockedBy,
        leaseVersion: task.leaseVersion,
        leaseExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    })
    if (!active) throw new Error('Generation worker lease was lost')
  }
}
