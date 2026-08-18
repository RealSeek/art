import { Processor, WorkerHost } from '@nestjs/bullmq'
import { SubscriptionsService } from './subscriptions.service'

@Processor('subscription-lifecycle', { concurrency: 1 })
export class SubscriptionsProcessor extends WorkerHost {
  constructor(private readonly subscriptions: SubscriptionsService) { super() }
  process() { return this.subscriptions.processDueRenewals() }
}
