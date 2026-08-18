import { Module } from '@nestjs/common'
import { AdminProvidersController } from './admin-providers.controller'
import { CatalogController } from './catalog.controller'
import { CredentialCryptoService } from './credential-crypto.service'
import { ProvidersService } from './providers.service'
import { UserCredentialsController, UserModelPolicyController } from './user-credentials.controller'
import { RechargeController } from './recharge.controller'
import { AssetsModule } from '../assets/assets.module'
import { CapabilityRegistryService } from './capability-registry.service'
import { ModelDiscoveryService } from './model-discovery.service'

@Module({
  imports: [AssetsModule],
  controllers: [CatalogController, UserCredentialsController, UserModelPolicyController, AdminProvidersController, RechargeController],
  providers: [CapabilityRegistryService, CredentialCryptoService, ModelDiscoveryService, ProvidersService],
  exports: [CapabilityRegistryService, CredentialCryptoService, ModelDiscoveryService, ProvidersService],
})
export class ProvidersModule {}
