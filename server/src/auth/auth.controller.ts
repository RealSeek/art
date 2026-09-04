import { BadRequestException, Body, Controller, Get, HttpCode, Logger, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { Throttle } from '@nestjs/throttler'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { CurrentUser, AuthenticatedUser, type AuthenticatedRequest } from '../common/request-user'

class AdminLoginDto { @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; @IsOptional() @IsBoolean() remember?: boolean }
class SetupAdminDto { @IsEmail() email!: string; @IsString() @MinLength(8) @MaxLength(200) password!: string; @IsOptional() @IsString() @MaxLength(100) displayName?: string }
class AdminAccountUpdateDto {
  @IsString() @MinLength(8) @MaxLength(200) currentPassword!: string
  @IsOptional() @IsEmail() @MaxLength(320) email?: string
  @IsOptional() @IsString() @MinLength(8) @MaxLength(200) newPassword?: string
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}
  private cookieSecure() {
    return this.config.get<boolean>('COOKIE_SECURE') ?? process.env.NODE_ENV === 'production'
  }
  private setSessionCookie(response: FastifyReply, result: { token: string; expiresAt: Date }, persistent = true) {
    response.setCookie('flux_session', result.token, { httpOnly: true, secure: this.cookieSecure(), sameSite: 'lax', path: '/', ...(persistent ? { expires: result.expiresAt } : {}) })
  }
  @Get('new-api/start') async newApiStart(@Query('redirect') redirect: string | undefined, @Res() response: FastifyReply) {
    const state = randomBytes(24).toString('base64url')
    const secure = this.cookieSecure()
    response.setCookie('onlyart_new_api_state', state, { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/new-api', maxAge: 600 })
    response.setCookie('onlyart_new_api_redirect', this.safeRedirect(redirect), { httpOnly: true, secure, sameSite: 'lax', path: '/v1/auth/new-api', maxAge: 600 })
    response.redirect(this.auth.getNewApiAuthorization(state, this.newApiRedirectUri()))
  }
  @Get('new-api/callback') async newApiCallback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Req() request: FastifyRequest, @Res() response: FastifyReply) {
    const expected = String(request.cookies?.onlyart_new_api_state || '')
    const redirect = this.safeRedirect(request.cookies?.onlyart_new_api_redirect)
    response.clearCookie('onlyart_new_api_state', { path: '/v1/auth/new-api' })
    response.clearCookie('onlyart_new_api_redirect', { path: '/v1/auth/new-api' })
    if (!code || !state || !expected || !this.safeEqual(state, expected)) return response.redirect(this.newApiFailureRedirect(redirect))
    try {
      const result = await this.auth.loginWithNewApi(code, this.newApiRedirectUri(), { ip: request.ip, userAgent: request.headers['user-agent'] })
      if ('bindingRequired' in result) throw new BadRequestException('New API 身份不能完成自动登录')
      this.setSessionCookie(response, result)
      response.redirect(`${this.frontendOrigin()}${redirect}`)
    } catch (error) {
      this.logger.warn(`New API SSO 回调失败：${error instanceof Error ? error.message : '未知错误'}`)
      response.redirect(this.newApiFailureRedirect(redirect))
    }
  }
  @Post('admin/login') @Throttle({ default: { limit: () => Number(process.env.ADMIN_LOGIN_RATE_LIMIT || (process.env.NODE_ENV === 'production' ? 8 : 30)), ttl: 60_000 } }) async adminLogin(@Body() body: AdminLoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.auth.loginAdmin(body.email, body.password, { ip: request.ip, userAgent: request.headers['user-agent'] })
    this.setSessionCookie(response, result, body.remember !== false)
    return { user: result.user }
  }
  @Get('setup/status') async setupStatus() { return { required: await this.auth.isSetupRequired() } }
  @Post('setup') @Throttle({ default: { limit: 3, ttl: 60_000 } }) async setup(@Body() body: SetupAdminDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const installToken = request.headers['x-install-token']
    const result = await this.auth.setupAdmin(body, { ip: request.ip, userAgent: request.headers['user-agent'] }, Array.isArray(installToken) ? installToken[0] : installToken)
    this.setSessionCookie(response, result)
    return { user: result.user }
  }
  @Get('session') async session(@Req() request: FastifyRequest) { return { user: await this.auth.peekSession(request.cookies?.flux_session as string | undefined) } }
  @Patch('admin/account') @UseGuards(AuthGuard) async updateAdminAccount(@CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest, @Body() body: AdminAccountUpdateDto) {
    return this.auth.updateAdminAccount(user.id, request.sessionId, body, { ip: request.ip, userAgent: request.headers['user-agent'] })
  }
  @Get('me') @UseGuards(AuthGuard) me(@CurrentUser() user: AuthenticatedUser) { return user }
  @Post('logout') @HttpCode(204) @UseGuards(AuthGuard) async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: FastifyReply) { await this.auth.revoke(request.sessionId); response.clearCookie('flux_session', { path: '/' }) }

  private safeRedirect(value?: string) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/chat' }
  private safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }
  private frontendOrigin() { return (this.config.get<string>('WEB_ORIGIN') || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '') }
  private newApiRedirectUri() { return this.config.get<string>('NEW_API_SSO_REDIRECT_URI') || `${this.frontendOrigin()}/v1/auth/new-api/callback` }
  private newApiFailureRedirect(redirect: string) { return `${this.frontendOrigin()}/login?error=new-api&redirect=${encodeURIComponent(redirect)}` }
}
