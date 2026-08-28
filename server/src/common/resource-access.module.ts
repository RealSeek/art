import { Global, Module } from '@nestjs/common'
import { ResourceAccessService } from './resource-access.service'
import { PublicEndpointPolicyService } from './public-endpoint-policy.service'

@Global()
@Module({ providers: [ResourceAccessService, PublicEndpointPolicyService], exports: [ResourceAccessService, PublicEndpointPolicyService] })
export class ResourceAccessModule {}
