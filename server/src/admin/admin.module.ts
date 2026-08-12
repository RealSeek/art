import { Module } from '@nestjs/common'
import { CreditsModule } from '../credits/credits.module'
import { AssetsModule } from '../assets/assets.module'
import { GenerationsModule } from '../generations/generations.module'
import { AdminController } from './admin.controller'
import { AdminGuard } from './admin.guard'
import { AdminOperationsController } from './admin-operations.controller'
import { AdminInspirationsController } from './admin-inspirations.controller'
import { AdminPromptTemplatesController } from '../prompt-templates/prompt-templates.controller'
import { AdminPromptLibraryController } from '../prompt-templates/prompt-library.controller'
import { PromptTemplatesModule } from '../prompt-templates/prompt-templates.module'

@Module({ imports: [CreditsModule, AssetsModule, GenerationsModule, PromptTemplatesModule], controllers: [AdminController, AdminOperationsController, AdminInspirationsController, AdminPromptTemplatesController, AdminPromptLibraryController], providers: [AdminGuard] })
export class AdminModule {}
