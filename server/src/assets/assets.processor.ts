import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { OnModuleInit } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { AssetsService } from './assets.service'

@Processor('asset-maintenance', { concurrency: 1 })
export class AssetsProcessor extends WorkerHost implements OnModuleInit {
  constructor(private readonly assets: AssetsService, @InjectQueue('asset-maintenance') private readonly queue: Queue) { super() }

  async onModuleInit() {
    await this.queue.upsertJobScheduler('asset-expiry-cleanup', { every: 60 * 60_000 }, {
      name: 'cleanup', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 },
    })
  }

  async process(job: Job) {
    if (job.name !== 'cleanup') return
    return this.assets.cleanupExpired()
  }
}
