import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator'
import { ModelCapability } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { ProvidersService } from './providers.service'

class CreateCredentialDto {
  @IsString() @MinLength(4) @MaxLength(1000) apiKey!: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number
  @IsOptional() @IsInt() @Min(1) @Max(10000) weight?: number
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsISO8601() expiresAt?: string | null
}

class UpdateCredentialDto {
  @IsOptional() @IsString() @MaxLength(1000) apiKey?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number
  @IsOptional() @IsInt() @Min(1) @Max(10000) weight?: number
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsISO8601() expiresAt?: string | null
}

class RotateCredentialDto {
  @IsString() @MinLength(4) @MaxLength(1000) apiKey!: string
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsISO8601() expiresAt?: string | null
}

class UserModelRouteDto {
  @IsString() credentialId!: string
  @IsString() @MinLength(1) @MaxLength(200) upstreamModel!: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) priority?: number
  @IsOptional() @IsInt() @Min(1) @Max(10000) weight?: number
}

class CreateUserModelDto {
  @IsString() @MinLength(1) @MaxLength(100) displayName!: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() vendorId?: string
  @IsEnum(ModelCapability) capability!: ModelCapability
  @IsOptional() @IsIn(['openai', 'anthropic', 'gemini']) apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  @IsOptional() @IsIn(['PRIORITY', 'WEIGHTED', 'ROUND_ROBIN']) routingStrategy?: 'PRIORITY' | 'WEIGHTED' | 'ROUND_ROBIN'
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsObject() options?: Record<string, unknown>
  @IsArray() @ValidateNested({ each: true }) @Type(() => UserModelRouteDto) routes!: UserModelRouteDto[]
}

class UpdateUserModelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) displayName?: string
  @IsOptional() @IsString() @MaxLength(1000) description?: string
  @IsOptional() @IsString() vendorId?: string
  @IsOptional() @IsEnum(ModelCapability) capability?: ModelCapability
  @IsOptional() @IsIn(['openai', 'anthropic', 'gemini']) apiProtocol?: 'openai' | 'anthropic' | 'gemini'
  @IsOptional() @IsIn(['PRIORITY', 'WEIGHTED', 'ROUND_ROBIN']) routingStrategy?: 'PRIORITY' | 'WEIGHTED' | 'ROUND_ROBIN'
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() isDefault?: boolean
  @IsOptional() @IsObject() options?: Record<string, unknown>
}

class ReplaceUserModelRoutesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => UserModelRouteDto) routes!: UserModelRouteDto[]
}

class ImportCredentialModelsDto {
  @IsOptional() @IsArray() @IsString({ each: true }) modelIds?: string[]
  @IsOptional() @IsBoolean() importAll?: boolean
}

class ProvisionOnlyCodeCredentialDto {
  @IsString() @MinLength(1) @MaxLength(64) group!: string
  @IsOptional() @IsString() @MaxLength(50) name?: string
}

@Controller('users/me/api-credentials')
@UseGuards(AuthGuard)
export class UserCredentialsController {
  constructor(private readonly providers: ProvidersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.providers.listCredentials(user.id) }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateCredentialDto) { return this.providers.createCredential(user.id, body) }
  @Post('only-code') provisionOnlyCode(@CurrentUser() user: AuthenticatedUser, @Body() body: ProvisionOnlyCodeCredentialDto) { return this.providers.provisionOnlyCodeCredential(user.id, body.group, body.name) }
  @Patch(':id') update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateCredentialDto) { return this.providers.updateCredential(user.id, id, body) }
  @Post(':id/discover-models') discover(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.providers.discoverCredentialModels(user.id, id) }
  @Post(':id/import-models') importModels(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ImportCredentialModelsDto) { return this.providers.importCredentialModels(user.id, id, body) }
  @Post(':id/test') test(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.providers.discoverCredentialModels(user.id, id) }
  @Get(':id/usage') usage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.providers.credentialUsage(user.id, id).then((rows) => rows[0]) }
  @Post(':id/rotate') rotate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: RotateCredentialDto) { return this.providers.rotateCredential(user.id, id, body.apiKey, body.expiresAt) }
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
    const policy = await this.providers.userPolicy(user.id)
    return { allowUserByok: true, creditRatePercent: policy.creditRatePercent, restrictModels: policy.restrictModels, groups: policy.groups }
  }

  @Get('private-models') privateModels(@CurrentUser() user: AuthenticatedUser) { return this.providers.listPrivateModels(user.id) }
  @Post('private-models') createPrivateModel(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateUserModelDto) { return this.providers.createPrivateModel(user.id, body) }
  @Patch('private-models/:id') updatePrivateModel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateUserModelDto) { return this.providers.updatePrivateModel(user.id, id, body) }
  @Put('private-models/:id/routes') replacePrivateModelRoutes(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ReplaceUserModelRoutesDto) { return this.providers.replacePrivateModelRoutes(user.id, id, body.routes) }
  @Delete('private-models/:id') deletePrivateModel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.providers.deletePrivateModel(user.id, id) }
}
