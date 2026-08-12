import { Module } from '@nestjs/common'
import { WorkspaceController, AdminWorkspaceController } from './workspace.controller'
import { AssetsModule } from '../assets/assets.module'

@Module({ imports: [AssetsModule], controllers: [WorkspaceController, AdminWorkspaceController] })
export class WorkspaceModule {}
