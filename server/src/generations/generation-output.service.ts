import { Injectable } from '@nestjs/common'
import { AssetKind, GenerationJob, Prisma } from '@prisma/client'
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
      await this.withActiveLease(task, (tx) => tx.jobOutput.create({
        data: { jobId: task.id, assetId: asset.id, position: input.position ?? 0 },
      }))
    } catch (error) {
      await this.assets.remove(task.userId, asset.id).catch(() => undefined)
      throw error
    }
    return asset
  }

  async linkExisting(task: GenerationJob, assetId: string, position = 0) {
    return this.withActiveLease(task, (tx) => tx.jobOutput.upsert({
      where: { jobId_assetId: { jobId: task.id, assetId } },
      create: { jobId: task.id, assetId, position },
      update: { position },
    }))
  }

  async cleanup(
    task: Pick<GenerationJob, 'id' | 'userId'> & Partial<Pick<GenerationJob, 'lockedBy' | 'leaseVersion'>>,
    options: { requireActiveLease?: boolean } = {},
  ) {
    let outputs: Array<{ assetId: string }>
    if (options.requireActiveLease) {
      if (task.lockedBy === undefined || task.leaseVersion === undefined) throw new Error('Generation worker lease is missing')
      outputs = await this.withActiveLease(
        task as Pick<GenerationJob, 'id' | 'lockedBy' | 'leaseVersion'>,
        async (tx) => {
          const linked = await tx.jobOutput.findMany({ where: { jobId: task.id }, select: { assetId: true } })
          if (linked.length) await tx.jobOutput.deleteMany({ where: { jobId: task.id } })
          return linked
        },
      )
    } else {
      outputs = await this.prisma.$transaction(async (tx) => {
        const linked = await tx.jobOutput.findMany({ where: { jobId: task.id }, select: { assetId: true } })
        if (linked.length) await tx.jobOutput.deleteMany({ where: { jobId: task.id } })
        return linked
      })
    }
    for (const output of outputs) await this.assets.remove(task.userId, output.assetId).catch(() => undefined)
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

  private async withActiveLease<T>(
    task: Pick<GenerationJob, 'id' | 'lockedBy' | 'leaseVersion'>,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (!task.lockedBy) throw new Error('Generation worker lease is missing')
    return this.prisma.$transaction(async (tx) => {
      // Updating the Generation row acquires the same lock used by lease
      // recovery. The output mutation therefore cannot race a fencing update.
      const active = await tx.generationJob.updateMany({
        where: {
          id: task.id,
          status: 'RUNNING',
          lockedBy: task.lockedBy,
          leaseVersion: task.leaseVersion,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { updatedAt: new Date() },
      })
      if (active.count !== 1) throw new Error('Generation worker lease was lost')
      return operation(tx)
    })
  }
}
