import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator'
import { Throttle } from '@nestjs/throttler'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { CurrentUser, AuthenticatedUser, type AuthenticatedRequest } from '../common/request-user'

class RequestCodeDto { @IsEmail() email!: string }
class VerifyCodeDto { @IsEmail() email!: string; @IsString() @Length(6, 6) code!: string }
class CompleteEmailRegistrationDto {
  @IsString() @MinLength(20) @MaxLength(200) ticket!: string
  @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/) username!: string
  @IsOptional() @IsString() @MaxLength(100) displayName?: string
  @IsString() @MinLength(8) @MaxLength(200) password!: string
  @IsOptional() @IsString() @MaxLength(64) inviteCode?: string
}
class AdminLoginDto { @IsEmail() email!: string; @IsString() @MinLength(8) password!: string }
class AdminMfaLoginDto { @IsString() @MinLength(20) @MaxLength(200) ticket!: string; @IsString() @MinLength(6) @MaxLength(64) code!: string }
class AdminMfaEnableDto { @IsString() @MinLength(20) @MaxLength(200) ticket!: string; @IsString() @Length(6, 6) code!: string }
class AdminMfaCodeDto { @IsString() @MinLength(6) @MaxLength(64) code!: string }
class AdminMfaDisableDto extends AdminMfaCodeDto { @IsString() @MinLength(8) @MaxLength(200) password!: string }
class PasswordLoginDto { @IsString() @MinLength(3) @MaxLength(320) identifier!: string; @IsString() @MinLength(8) @MaxLength(200) password!: string }
class PasswordRegisterDto {
  @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/) username!: string
  @IsOptional() @IsEmail() @MaxLength(320) email?: string
  @IsOptional() @IsString() @MaxLength(100) displayName?: string
  @IsString() @MinLength(8) @MaxLength(200) password!: string
  @IsOptional() @IsString() @MaxLength(64) inviteCode?: string
}
class ExternalBindCodeDto { @IsString() @MinLength(20) @MaxLength(200) ticket!: string; @IsEmail() email!: string }
class ExternalBindCompleteDto {
  @IsString() @MinLength(20) @MaxLength(200) ticket!: string
  @IsEmail() email!: string
  @IsString() @Length(6, 6) code!: string
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/) username?: string
  @IsOptional() @IsString() @MaxLength(100) displayName?: string
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) password?: string
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}
  private cookieSecure() {
    return this.config.get<boolean>('COOKIE_SECURE') ?? process.env.NODE_ENV === 'production'
  }
  private setSessionCookie(response: FastifyReply, result: { token: string; expiresAt: Date }) {
    response.setCookie('flux_session', result.token, { httpOnly: true, secure: this.cookieSecure(), sameSite: 'lax', path: '/', expires: result.expiresAt })
  }
  @Post('code/request') @Throttle({ default: { limit: 5, ttl: 60_000 } }) requestCode(@Body() body: RequestCodeDto) { return this.auth.requestCode(body.email) }
  @Post('code/verify') @Throttle({ default: { limit: 10, ttl: 60_000 } }) async verify(@Body() body: VerifyCodeDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.verifyCode(body.email, body.code, { ip: request.ip, userAgent: request.headers['user-agent'] })
    if ('token' in result) {
      this.setSessionCookie(response, result)
      return { user: result.user }
    }
    return result
  }
  @Post('code/register') @Throttle({ default: { limit: 6, ttl: 60_000 } }) async completeEmailRegistration(@Body() body: CompleteEmailRegistrationDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.completeEmailRegistration(body, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Post('password/login') @Throttle({ default: { limit: 10, ttl: 60_000 } }) async passwordLogin(@Body() body: PasswordLoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.loginWithPassword(body.identifier, body.password, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Post('password/register') @Throttle({ default: { limit: 6, ttl: 60_000 } }) async passwordRegister(@Body() body: PasswordRegisterDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.registerWithPassword(body, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Post('external/bind/code') @Throttle({ default: { limit: 5, ttl: 60_000 } }) externalBindCode(@Body() body: ExternalBindCodeDto) { return this.auth.requestExternalBindCode(body.ticket, body.email) }
  @Post('external/bind/complete') @Throttle({ default: { limit: 8, ttl: 60_000 } }) async externalBindComplete(@Body() body: ExternalBindCompleteDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.completeExternalBind(body, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Get('oauth/linuxdo/start') async linuxDoStart(@Query('redirect') redirect: string | undefined, @Query('invite') invite: string | undefined, @Res() response: FastifyReply) {
    const state = randomBytes(24).toString('base64url')
    const verifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const secure = this.cookieSecure()
    response.setCookie('xinyue_linuxdo_state', state, { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    response.setCookie('xinyue_linuxdo_verifier', verifier, { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    response.setCookie('xinyue_oauth_redirect', this.safeRedirect(redirect), { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    const inviteCode = typeof invite === 'string' && /^[A-Z0-9_-]{4,64}$/i.test(invite.trim()) ? invite.trim().toUpperCase() : ''
    if (inviteCode) response.setCookie('xinyue_referral_code', inviteCode, { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/oauth/linuxdo', maxAge: 600 })
    response.redirect(await this.auth.getLinuxDoAuthorization(state, challenge))
  }
  @Get('oauth/linuxdo/callback') async linuxDoCallback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Req() request: FastifyRequest, @Res() response: FastifyReply) {
    const expected = String(request.cookies?.xinyue_linuxdo_state || '')
    const verifier = String(request.cookies?.xinyue_linuxdo_verifier || '')
    if (!code || !state || !expected || !verifier || !this.safeEqual(state, expected)) throw new BadRequestException('Linux.do 登录状态无效或已过期')
    const result = await this.auth.loginWithLinuxDo(code, verifier, { ip: request.ip, userAgent: request.headers['user-agent'] }, String(request.cookies?.xinyue_referral_code || '')) as { user: { id: string; email: string | null; username: string | null; displayName: string; role: string }; token: string; expiresAt: Date } | { bindingRequired: true; provider: string; ticket: string; displayName?: string; email?: string }
    response.clearCookie('xinyue_linuxdo_state', { path: '/v1/auth/oauth/linuxdo' })
    response.clearCookie('xinyue_linuxdo_verifier', { path: '/v1/auth/oauth/linuxdo' })
    const redirect = this.safeRedirect(request.cookies?.xinyue_oauth_redirect)
    response.clearCookie('xinyue_oauth_redirect', { path: '/v1/auth/oauth/linuxdo' })
    response.clearCookie('xinyue_referral_code', { path: '/v1/auth/oauth/linuxdo' })
    const frontendOrigin = (this.config.get<string>('WEB_ORIGIN') || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')
    if ('bindingRequired' in result) return response.redirect(`${frontendOrigin}/login?bind=${encodeURIComponent(result.provider)}&ticket=${encodeURIComponent(result.ticket)}&redirect=${encodeURIComponent(redirect)}`)
    this.setSessionCookie(response, result)
    response.redirect(`${frontendOrigin}${redirect}`)
  }
  @Post('admin/login') @Throttle({ default: { limit: () => Number(process.env.ADMIN_LOGIN_RATE_LIMIT || (process.env.NODE_ENV === 'production' ? 8 : 30)), ttl: 60_000 } }) async adminLogin(@Body() body: AdminLoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.loginAdmin(body.email, body.password, { ip: request.ip, userAgent: request.headers['user-agent'] })
    if ('mfaRequired' in result) return result
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Post('admin/mfa/login') @Throttle({ default: { limit: 10, ttl: 60_000 } }) async adminMfaLogin(@Body() body: AdminMfaLoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.verifyAdminMfaLogin(body.ticket, body.code, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Get('admin/mfa/status') @UseGuards(AuthGuard) adminMfaStatus(@CurrentUser() user: AuthenticatedUser) { return this.auth.adminMfaStatus(user.id) }
  @Post('admin/mfa/setup') @UseGuards(AuthGuard) adminMfaSetup(@CurrentUser() user: AuthenticatedUser) { return this.auth.beginAdminMfaSetup(user.id) }
  @Post('admin/mfa/enable') @UseGuards(AuthGuard) adminMfaEnable(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Body() body: AdminMfaEnableDto) { return this.auth.enableAdminMfa(user.id, request.sessionId, body.ticket, body.code, { ip: request.ip, userAgent: request.headers['user-agent'] }) }
  @Post('admin/mfa/recovery-codes') @UseGuards(AuthGuard) adminMfaRecoveryCodes(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Body() body: AdminMfaCodeDto) { return this.auth.regenerateAdminMfaRecoveryCodes(user.id, body.code, { ip: request.ip, userAgent: request.headers['user-agent'] }) }
  @Post('admin/mfa/verify-session') @UseGuards(AuthGuard) adminMfaVerifySession(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Body() body: AdminMfaCodeDto) { return this.auth.verifyAdminMfaSession(user.id, request.sessionId, body.code, { ip: request.ip, userAgent: request.headers['user-agent'] }) }
  @Post('admin/mfa/disable') @UseGuards(AuthGuard) adminMfaDisable(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Body() body: AdminMfaDisableDto) { return this.auth.disableAdminMfa(user.id, request.sessionId, body.password, body.code, { ip: request.ip, userAgent: request.headers['user-agent'] }) }
  @Get('me') @UseGuards(AuthGuard) me(@CurrentUser() user: AuthenticatedUser) { return user }
  @Post('logout') @HttpCode(204) @UseGuards(AuthGuard) async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: FastifyReply) { await this.auth.revoke(request.sessionId); response.clearCookie('flux_session', { path: '/' }) }

  private safeRedirect(value?: string) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/chat' }
  private safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
}
