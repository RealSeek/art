import { Module } from '@nestjs/common'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'
import { ObjectStorageService } from './object-storage.service'

@Module({ controllers: [AssetsController], providers: [AssetsService, ObjectStorageService], exports: [AssetsService, ObjectStorageService] })
export class AssetsModule {}
