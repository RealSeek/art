import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { PromptLibraryService } from './prompt-library.service'

@Processor('prompt-library', { concurrency: 1 })
export class PromptLibraryProcessor extends WorkerHost {
  constructor(private readonly library: PromptLibraryService) { super() }

  async process(job: Job) {
    if (job.name !== 'refresh') return
    return this.library.refreshAll()
  }
}
