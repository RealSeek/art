import { Injectable } from '@nestjs/common'
import {
  orderPlatformRoutes,
  orderPrivateRoutes,
  providerSourceRequirement,
  userCredentialCreditCost,
  type ProviderSourceRequirement,
} from './provider-routing'

@Injectable()
export class ProviderRoutingService {
  sourceRequirement(value: unknown): ProviderSourceRequirement {
    return providerSourceRequirement(value)
  }

  credentialCreditCost(source: ProviderSourceRequirement, platformCost: number) {
    return userCredentialCreditCost(source, platformCost)
  }

  orderPrivate<T>(candidates: Array<{ value: T; priority: number; weight: number; createdAt?: Date }>, strategy: string) {
    return orderPrivateRoutes(candidates, strategy)
  }

  orderPlatform<T>(candidates: Array<{ value: T; priority: number; weight: number }>) {
    return orderPlatformRoutes(candidates)
  }
}
