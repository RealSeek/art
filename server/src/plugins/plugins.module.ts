import { Module } from '@nestjs/common'
import { AdminPluginsController } from './admin-plugins.controller'
import { PluginsController } from './plugins.controller'
import { PluginsService } from './plugins.service'

@Module({ controllers: [PluginsController, AdminPluginsController], providers: [PluginsService], exports: [PluginsService] })
export class PluginsModule {}
