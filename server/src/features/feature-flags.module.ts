import { Module } from '@nestjs/common'
import { FeatureFlagsController } from './feature-flags.controller'
import { FeatureFlagsService } from './feature-flags.service'
import { AdminGuard } from '../admin/admin.guard'

@Module({ controllers: [FeatureFlagsController], providers: [FeatureFlagsService, AdminGuard], exports: [FeatureFlagsService] })
export class FeatureFlagsModule {}
