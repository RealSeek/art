import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { AccountLifecycleService } from './account-lifecycle.service'
import { ReferralService } from './referral.service'

@Processor('commercial-lifecycle', { concurrency: 2 })
export class AccountLifecycleProcessor extends WorkerHost {
  constructor(private readonly lifecycle: AccountLifecycleService, private readonly referrals: ReferralService) { super() }
  process(job: Job<{ requestId?: string }>) {
    if (job.name === 'delete-account' && job.data.requestId) return this.lifecycle.process(job.data.requestId)
    if (job.name === 'scan-referrals') return this.referrals.processDue()
    return this.lifecycle.processDue()
  }
}
