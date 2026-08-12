import { Module } from '@nestjs/common'
import { WorkspaceController, AdminWorkspaceController } from './workspace.controller'
import { AssetsModule } from '../assets/assets.module'
import { OfficeExportService } from './office-export.service'
import { ProvidersModule } from '../providers/providers.module'

@Module({ imports: [AssetsModule, ProvidersModule], controllers: [WorkspaceController, AdminWorkspaceController], providers: [OfficeExportService] })
export class WorkspaceModule {}
