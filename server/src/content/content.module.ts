import { Module } from '@nestjs/common'
import { ContentController, PublicContentController } from './content.controller'

@Module({ controllers: [ContentController, PublicContentController] })
export class ContentModule {}
