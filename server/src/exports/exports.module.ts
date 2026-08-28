import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ExportsController } from './exports.controller'
import { ExportsProcessor } from './exports.processor'
import { ExportsService } from './exports.service'

@Module({ imports: [BullModule.registerQueue({ name: 'export' })], controllers: [ExportsController], providers: [ExportsService, ExportsProcessor], exports: [ExportsService] })
export class ExportsModule {}
