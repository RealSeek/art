import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module'
import { ModerationModule } from '../moderation/moderation.module'
import { AdminWorksController, GalleryController, WorksController } from './works.controller'
import { WorksService } from './works.service'

@Module({ imports: [AssetsModule, ModerationModule], controllers: [WorksController, GalleryController, AdminWorksController], providers: [WorksService] })
export class WorksModule {}
