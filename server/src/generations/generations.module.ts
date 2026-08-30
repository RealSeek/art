import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module'
import { CreditsModule } from '../credits/credits.module'
import { GenerationsController } from './generations.controller'
import { GenerationsProcessor } from './generations.processor'
import { GenerationsService } from './generations.service'
import { ProvidersModule } from '../providers/providers.module'
import { ModerationModule } from '../moderation/moderation.module'
import { PluginsModule } from '../plugins/plugins.module'
import { WebSearchModule } from '../agent-tasks/web-search.module'
import { GenerationEventsService } from './generation-events.service'
import { GenerationLifecycleService } from './generation-lifecycle.service'
import { FeatureFlagsModule } from '../features/feature-flags.module'
import { ImageGenerationRunner } from './runners/image-generation.runner'
import { ChatGenerationRunner } from './runners/chat-generation.runner'
import { VideoGenerationRunner } from './runners/video-generation.runner'
import { GenerationOutputService } from './generation-output.service'
import { UsageRecordsService } from './usage-records.service'
import { BillingModule } from '../billing/billing.module'
import { ChatContextService } from './chat-context.service'
import { ToolLoopRunner } from './tool-loop.runner'
import { GenerationSettlementService } from './generation-settlement.service'
import { ProviderAttemptAuditService } from './provider-attempt-audit.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'generation' }), BillingModule, CreditsModule, AssetsModule, ProvidersModule, ModerationModule, PluginsModule, WebSearchModule, FeatureFlagsModule],
  controllers: [GenerationsController],
  providers: [GenerationsService, GenerationsProcessor, GenerationEventsService, GenerationLifecycleService, GenerationOutputService, GenerationSettlementService, ProviderAttemptAuditService, UsageRecordsService, ChatContextService, ToolLoopRunner, ChatGenerationRunner, ImageGenerationRunner, VideoGenerationRunner],
  exports: [GenerationsService],
})
export class GenerationsModule {}
