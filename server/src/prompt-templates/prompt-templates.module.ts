import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { PromptTemplatesController } from './prompt-templates.controller'
import { PromptLibraryController } from './prompt-library.controller'
import { PromptLibraryService } from './prompt-library.service'
import { PromptLibraryProcessor } from './prompt-library.processor'

@Module({ imports: [BullModule.registerQueue({ name: 'prompt-library' })], controllers: [PromptTemplatesController, PromptLibraryController], providers: [PromptLibraryService, PromptLibraryProcessor], exports: [PromptLibraryService] })
export class PromptTemplatesModule {}
