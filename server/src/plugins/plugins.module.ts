import { Module } from '@nestjs/common'
import { AdminPluginsController } from './admin-plugins.controller'
import { PluginsController } from './plugins.controller'
import { PluginsService } from './plugins.service'
import { ExternalMarketService } from './external-market.service'

@Module({ controllers: [PluginsController, AdminPluginsController], providers: [PluginsService, ExternalMarketService], exports: [PluginsService, ExternalMarketService] })
export class PluginsModule {}
