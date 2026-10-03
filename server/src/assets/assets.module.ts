import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'
import { ObjectStorageService } from './object-storage.service'
import { AssetsProcessor } from './assets.processor'
import { VideoReferencesController } from './video-references.controller'

@Module({ imports: [BullModule.registerQueue({ name: 'asset-maintenance' })], controllers: [AssetsController, VideoReferencesController], providers: [AssetsService, ObjectStorageService, AssetsProcessor], exports: [AssetsService, ObjectStorageService] })
export class AssetsModule {}
