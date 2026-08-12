import { Module } from '@nestjs/common'
import { CreditsModule } from '../credits/credits.module'
import { EngagementController } from './engagement.controller'

@Module({ imports: [CreditsModule], controllers: [EngagementController] })
export class EngagementModule {}
