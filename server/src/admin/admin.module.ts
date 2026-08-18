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
import { NotificationsModule } from '../notifications/notifications.module'
import { AdminNotificationsController } from './admin-notifications.controller'
import { AdminRolesController } from './admin-roles.controller'
import { AdminRolesService } from './admin-roles.service'

@Module({ imports: [CreditsModule, AssetsModule, GenerationsModule, PromptTemplatesModule, NotificationsModule], controllers: [AdminController, AdminOperationsController, AdminInspirationsController, AdminPromptTemplatesController, AdminPromptLibraryController, AdminNotificationsController, AdminRolesController], providers: [AdminGuard, AdminRolesService] })
export class AdminModule {}
