import { Body, Controller, Get, Logger, NotFoundException, Patch, ServiceUnavailableException, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, IsArray } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { ProvidersService } from '../providers/providers.service'

class UpdateSettingsDto {
  @IsOptional() @IsIn(['dark', 'light', 'system']) appearance?: string
  @IsOptional() @IsIn(['zh-CN', 'zh-TW', 'en', 'ja', 'ko']) language?: string
  @IsOptional() @IsString() @MaxLength(30) responseStyle?: string
  @IsOptional() @IsString() @MaxLength(30) responseDetail?: string
  @IsOptional() @IsString() @MaxLength(30) replyLanguage?: string
  @IsOptional() @IsString() @MaxLength(1000) customInstructions?: string
  @IsOptional() @IsString() @MaxLength(80) nickname?: string
  @IsOptional() @IsString() @MaxLength(120) occupation?: string
  @IsOptional() @IsString() @MaxLength(1000) bio?: string
  @IsOptional() @IsBoolean() useMemory?: boolean
  @IsOptional() @IsBoolean() referenceChats?: boolean
  @IsOptional() @IsBoolean() notifications?: boolean
  @IsOptional() @IsBoolean() chatHistoryEnabled?: boolean
  @IsOptional() @IsBoolean() trainingOptOut?: boolean
  @IsOptional() @IsBoolean() temporaryChatDefault?: boolean
  @IsOptional() @IsInt() @Min(0) @Max(3650) dataRetentionDays?: number
  @IsOptional() @IsBoolean() shareUsageAnalytics?: boolean
}

class UpdateOnboardingDto {
  @IsOptional() @IsIn(['BEGINNER', 'EXPERIENCED']) experience?: 'BEGINNER' | 'EXPERIENCED'
  @IsOptional() @IsArray() @IsIn(['CHAT', 'IMAGE', 'VIDEO'], { each: true }) capabilities?: Array<'CHAT' | 'IMAGE' | 'VIDEO'>
  @IsOptional() @IsBoolean() complete?: boolean
}

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly providers: ProvidersService) {}
  @Get('me') async me(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, email: true, displayName: true, avatarUrl: true, role: true, createdAt: true, settings: true, groupMemberships: { include: { group: { select: { id: true, name: true, color: true } } } } } })
  }
  @Get('me/only-code-balance') async onlyCodeBalance(@CurrentUser() user: AuthenticatedUser) {
    const identity = await this.prisma.externalIdentity.findFirst({ where: { userId: user.id, provider: 'new-api' }, select: { subject: true } })
    if (!identity) throw new NotFoundException('当前账号未绑定 OnlyCode')
    const baseUrl = this.config.get<string>('NEW_API_BASE_URL')
    const clientId = this.config.get<string>('NEW_API_SSO_CLIENT_ID')
    const clientSecret = this.config.get<string>('NEW_API_SSO_CLIENT_SECRET')
    if (!baseUrl || !clientId || !clientSecret) throw new ServiceUnavailableException('OnlyCode 余额查询尚未配置')
    const response = await fetch(new URL('/api/sso/art/account', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, subject: identity.subject }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    }).catch((error: unknown) => {
      this.logger.warn(`OnlyCode 余额查询失败：${error instanceof Error ? error.message : '网络请求失败'}`)
      return null
    })
    if (!response?.ok) {
      this.logger.warn(`OnlyCode 余额查询失败：HTTP ${response?.status || 0}`)
      throw new ServiceUnavailableException('OnlyCode 余额暂时不可用')
    }
    const payload = await response.json().catch(() => null) as { success?: boolean; data?: { balance?: unknown; symbol?: unknown; display_type?: unknown } } | null
    const balance = Number(payload?.data?.balance)
    if (!payload?.success || !Number.isFinite(balance)) throw new ServiceUnavailableException('OnlyCode 余额数据无效')
    return {
      balance,
      symbol: typeof payload.data?.symbol === 'string' ? payload.data.symbol : '',
      displayType: typeof payload.data?.display_type === 'string' ? payload.data.display_type : 'USD',
    }
  }
  @Get('me/onboarding') async onboarding(@CurrentUser() user: AuthenticatedUser) {
    const settings = await this.prisma.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } })
    return { required: settings.onboardingRequired, experience: settings.onboardingExperience, capabilities: settings.onboardingCapabilities, completedAt: settings.onboardingCompletedAt }
  }
  @Get('me/only-code-groups') onlyCodeGroups() { return this.providers.onlyCodeProvisioningGroupDetails() }
  @Patch('me/onboarding') async updateOnboarding(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateOnboardingDto) {
    return this.prisma.userSettings.upsert({
      where: { userId: user.id },
      update: { ...(body.experience !== undefined ? { onboardingExperience: body.experience } : {}), ...(body.capabilities !== undefined ? { onboardingCapabilities: body.capabilities } : {}), ...(body.complete ? { onboardingRequired: false, onboardingCompletedAt: new Date() } : {}) },
      create: { userId: user.id, onboardingExperience: body.experience || '', onboardingCapabilities: body.capabilities || [], onboardingRequired: !body.complete, onboardingCompletedAt: body.complete ? new Date() : null },
    }).then((settings) => ({ required: settings.onboardingRequired, experience: settings.onboardingExperience, capabilities: settings.onboardingCapabilities, completedAt: settings.onboardingCompletedAt }))
  }
  @Patch('me/settings') async updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateSettingsDto) {
    return this.prisma.userSettings.upsert({ where: { userId: user.id }, update: body, create: { userId: user.id, ...body } })
  }
}
