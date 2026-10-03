import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { Logger, OnModuleInit } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { AssetsService } from './assets.service'

@Processor('asset-maintenance', { concurrency: 1 })
export class AssetsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AssetsProcessor.name)
  constructor(private readonly assets: AssetsService, @InjectQueue('asset-maintenance') private readonly queue: Queue) { super() }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('asset-expiry-cleanup', { every: 60 * 60_000 }, {
      name: 'cleanup', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
    await this.queue.upsertJobScheduler('video-reference-cleanup', { every: 60_000 }, {
      name: 'video-reference-cleanup', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  async process(job: Job) {
    if (job.name === 'video-reference-cleanup') {
      const result = await this.assets.cleanupVideoReferences()
      for (const failure of result.failures) this.logger.error(`Video reference ${failure.id} cleanup failed: ${failure.error}`)
      return result
    }
    if (job.name !== 'cleanup') return
    return this.assets.cleanupExpired()
  }
}
