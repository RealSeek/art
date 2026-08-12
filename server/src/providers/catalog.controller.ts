import { Controller, Get, Query } from '@nestjs/common'
import { ModelCapability } from '@prisma/client'
import { ProvidersService } from './providers.service'

@Controller('catalog')
export class CatalogController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('models')
  models(@Query('capability') capability?: string) {
    const normalized = capability?.toUpperCase()
    const value = normalized && Object.values(ModelCapability).includes(normalized as ModelCapability) ? normalized as ModelCapability : undefined
    return this.providers.listModels(value)
  }

  @Get('settings')
  settings() { return this.providers.getSystemSettings() }

  @Get('external-links')
  externalLinks() { return this.providers.listExternalLinks() }

  @Get('recharge-packages')
  packages() { return this.providers.listRechargePackages() }
}
