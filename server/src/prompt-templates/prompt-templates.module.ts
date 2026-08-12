import { Module } from '@nestjs/common'
import { PromptTemplatesController } from './prompt-templates.controller'
import { PromptLibraryController } from './prompt-library.controller'
import { PromptLibraryService } from './prompt-library.service'

@Module({ controllers: [PromptTemplatesController, PromptLibraryController], providers: [PromptLibraryService], exports: [PromptLibraryService] })
export class PromptTemplatesModule {}
