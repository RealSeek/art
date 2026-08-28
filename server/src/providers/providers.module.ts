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
import { ProviderHealthService } from './provider-health.service'
import { ProviderRoutingService } from './provider-routing.service'

@Module({
  imports: [AssetsModule],
  controllers: [CatalogController, UserCredentialsController, UserModelPolicyController, AdminProvidersController, RechargeController],
  providers: [CapabilityRegistryService, CredentialCryptoService, ModelDiscoveryService, ProviderHealthService, ProviderRoutingService, ProvidersService],
  exports: [CapabilityRegistryService, CredentialCryptoService, ModelDiscoveryService, ProviderHealthService, ProviderRoutingService, ProvidersService],
})
export class ProvidersModule {}
