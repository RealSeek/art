import { Module } from '@nestjs/common'
import { AdminCommerceController, CommerceController } from './commerce.controller'
import { CommerceService } from './commerce.service'

@Module({ controllers: [CommerceController, AdminCommerceController], providers: [CommerceService], exports: [CommerceService] })
export class CommerceModule {}
