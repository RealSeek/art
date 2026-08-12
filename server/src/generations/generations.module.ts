import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module'
import { CreditsModule } from '../credits/credits.module'
import { GenerationsController } from './generations.controller'
import { GenerationsProcessor } from './generations.processor'
import { GenerationsService } from './generations.service'
import { ProvidersModule } from '../providers/providers.module'
import { ModerationModule } from '../moderation/moderation.module'

@Module({
  imports: [BullModule.registerQueue({ name: 'generation' }), CreditsModule, AssetsModule, ProvidersModule, ModerationModule],
  controllers: [GenerationsController],
  providers: [GenerationsService, GenerationsProcessor],
  exports: [GenerationsService],
})
export class GenerationsModule {}
