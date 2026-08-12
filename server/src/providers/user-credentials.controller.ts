import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { ModelCapability, ProviderAuthType, ProviderType } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { ProvidersService } from './providers.service'

class CreateCredentialDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string
  @IsEnum(ProviderType) providerType!: ProviderType
  @IsString() @MinLength(8) @MaxLength(500) baseUrl!: string
  @IsString() @MinLength(4) @MaxLength(1000) apiKey!: string
  @IsOptional() @IsEnum(ProviderAuthType) authType?: ProviderAuthType
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsObject() customHeaders?: Record<string, string>
}

class UpdateCredentialDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string
  @IsOptional() @IsEnum(ProviderType) providerType?: ProviderType
  @IsOptional() @IsString() @MinLength(8) @MaxLength(500) baseUrl?: string
  @IsOptional() @IsString() @MaxLength(1000) apiKey?: string
  @IsOptional() @IsEnum(ProviderAuthType) authType?: ProviderAuthType
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsObject() customHeaders?: Record<string, string>
}

@Controller('users/me/api-credentials')
@UseGuards(AuthGuard)
export class UserCredentialsController {
  constructor(private readonly providers: ProvidersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.providers.listCredentials(user.id) }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateCredentialDto) { return this.providers.createCredential(user.id, body) }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateCredentialDto) { return this.providers.updateCredential(user.id, id, body) }
  @Delete(':id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.providers.deleteCredential(user.id, id) }
}

@Controller('users/me')
@UseGuards(AuthGuard)
export class UserModelPolicyController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('models')
  models(@CurrentUser() user: AuthenticatedUser, @Query('capability') capability?: string) {
    const normalized = capability?.toUpperCase()
    const value = normalized && Object.values(ModelCapability).includes(normalized as ModelCapability) ? normalized as ModelCapability : undefined
    return this.providers.listModelsForUser(user.id, value)
  }

  @Get('model-policy')
  async policy(@CurrentUser() user: AuthenticatedUser) {
    const [policy, settings] = await Promise.all([this.providers.userPolicy(user.id), this.providers.getSystemSettings()])
    return { allowUserByok: settings.userByokEnabled && policy.allowUserByok, creditRatePercent: policy.creditRatePercent, restrictModels: policy.restrictModels, groups: policy.groups }
  }
}
