import { Module } from '@nestjs/common'
import { AssetsModule } from '../assets/assets.module'
import { InspirationsController } from './inspirations.controller'

@Module({ imports: [AssetsModule], controllers: [InspirationsController] })
export class InspirationsModule {}
