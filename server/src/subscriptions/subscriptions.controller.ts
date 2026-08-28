import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { PlanBillingCycle, Prisma, RenewalAttemptStatus } from '@prisma/client'
import { IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PAYMENT_METHODS, type PaymentMethod } from '../payments/payment.constants'
import { PrismaService } from '../prisma/prisma.service'
import { SubscriptionsService } from './subscriptions.service'

class PlanDto {
  @IsString() @MinLength(1) @MaxLength(60) code!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsOptional() @IsEnum(PlanBillingCycle) billingCycle?: PlanBillingCycle
  @IsOptional() @IsInt() @Min(0) @Max(100000000) priceCents?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000000) originalPriceCents?: number
  @IsOptional() @IsString() @MaxLength(10) currency?: string
  @IsOptional() @IsInt() @Min(0) @Max(100000000) includedCredits?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000000000) monthlyQuotaUnits?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000000000) dailyQuotaUnits?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000000) tokenOverageRate?: number
  @IsOptional() @IsInt() @Min(1) @Max(28) tokenQuotaResetDay?: number
  @IsOptional() @IsBoolean() tokenQuotaCarryOver?: boolean
  @IsOptional() @IsIn(['BILLABLE_UNITS']) tokenQuotaMode?: 'BILLABLE_UNITS'
  @IsOptional() @IsIn(['BLOCK', 'OVERAGE_CREDITS']) tokenOverageMode?: 'BLOCK' | 'OVERAGE_CREDITS'
  @IsOptional() @IsIn(['QUOTA', 'FREE']) byokMode?: 'QUOTA' | 'FREE'
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number
  @IsOptional() @IsInt() @Min(1) @Max(100) concurrency?: number
  @IsOptional() @IsBoolean() allowByok?: boolean
  @IsOptional() @IsBoolean() apiAccess?: boolean
  @IsOptional() @IsBoolean() imageAccess?: boolean
  @IsOptional() @IsBoolean() videoAccess?: boolean
  @IsOptional() @IsBoolean() commerceAccess?: boolean
  @IsOptional() @IsBoolean() batchAccess?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() recommended?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
  @IsOptional() @IsObject() capabilities?: Record<string, unknown>
}
class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) code?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsOptional() @IsEnum(PlanBillingCycle) billingCycle?: PlanBillingCycle
  @IsOptional() @IsInt() @Min(0) @Max(100000000) priceCents?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000000) originalPriceCents?: number
  @IsOptional() @IsString() @MaxLength(10) currency?: string
  @IsOptional() @IsInt() @Min(0) @Max(100000000) includedCredits?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000000000) monthlyQuotaUnits?: number
  @IsOptional() @IsInt() @Min(0) @Max(1000000000000) dailyQuotaUnits?: number
  @IsOptional() @IsInt() @Min(0) @Max(100000000) tokenOverageRate?: number
  @IsOptional() @IsInt() @Min(1) @Max(28) tokenQuotaResetDay?: number
  @IsOptional() @IsBoolean() tokenQuotaCarryOver?: boolean
  @IsOptional() @IsIn(['BILLABLE_UNITS']) tokenQuotaMode?: 'BILLABLE_UNITS'
  @IsOptional() @IsIn(['BLOCK', 'OVERAGE_CREDITS']) tokenOverageMode?: 'BLOCK' | 'OVERAGE_CREDITS'
  @IsOptional() @IsIn(['QUOTA', 'FREE']) byokMode?: 'QUOTA' | 'FREE'
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number
  @IsOptional() @IsInt() @Min(1) @Max(100) concurrency?: number
  @IsOptional() @IsBoolean() allowByok?: boolean
  @IsOptional() @IsBoolean() apiAccess?: boolean
  @IsOptional() @IsBoolean() imageAccess?: boolean
  @IsOptional() @IsBoolean() videoAccess?: boolean
  @IsOptional() @IsBoolean() commerceAccess?: boolean
  @IsOptional() @IsBoolean() batchAccess?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsBoolean() recommended?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
  @IsOptional() @IsObject() capabilities?: Record<string, unknown>
}
class CreateOrderDto { @IsString() planId!: string; @IsIn(PAYMENT_METHODS) paymentMethod!: PaymentMethod; @IsOptional() @IsString() userCouponId?: string }
class TrialDto { @IsOptional() @IsString() planId?: string }
class GrantSubscriptionDto { @IsString() userId!: string; @IsString() planId!: string; @IsOptional() @IsInt() @Min(1) @Max(3650) days?: number }
class RenewalSettingsDto { @IsBoolean() enabled!: boolean; @IsOptional() @IsString() channelId?: string }

@Controller('subscriptions')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}
  @Get('plans') plans() { return this.subscriptions.listPlans() }
  @Get('me') current(@CurrentUser() user: AuthenticatedUser) { return this.subscriptions.current(user.id) }
  @Get('orders') orders(@CurrentUser() user: AuthenticatedUser) { return this.subscriptions.orders(user.id) }
  @Post('orders') createOrder(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateOrderDto) { return this.subscriptions.createOrder(user.id, body.planId, body.paymentMethod, body.userCouponId) }
  @Delete('orders/:id') cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.subscriptions.cancelOwnOrder(user.id, id) }
  @Post('trial') trial(@CurrentUser() user: AuthenticatedUser, @Body() body: TrialDto) { return this.subscriptions.startTrial(user.id, body.planId) }
  @Post('cancel') cancel(@CurrentUser() user: AuthenticatedUser) { return this.subscriptions.cancel(user.id) }
  @Get('renewal') renewal(@CurrentUser() user: AuthenticatedUser) { return this.subscriptions.renewalOptions(user.id) }
  @Patch('renewal') configureRenewal(@CurrentUser() user: AuthenticatedUser, @Body() body: RenewalSettingsDto) { return this.subscriptions.configureRenewal(user.id, body.enabled, body.channelId) }
  @Get('renewal-attempts') renewalAttempts(@CurrentUser() user: AuthenticatedUser) { return this.subscriptions.renewalAttempts(user.id) }
}

@Controller('admin/subscriptions')
@UseGuards(AuthGuard, AdminGuard)
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService, private readonly prisma: PrismaService) {}
  @Get('plans') plans() { return this.subscriptions.listPlans(true) }
  @Post('plans') create(@Body() body: PlanDto) { return this.subscriptions.createPlan(body) }
  @Patch('plans/:id') update(@Param('id') id: string, @Body() body: UpdatePlanDto) { return this.subscriptions.updatePlan(id, body) }
  @Delete('plans/:id') remove(@Param('id') id: string) { return this.subscriptions.deletePlan(id) }
  @Get('orders') orders() { return this.subscriptions.adminOrders() }
  @Get('active') active() { return this.subscriptions.adminSubscriptions() }
  @Get('renewal-attempts') renewalAttempts(@Query('status') status?: RenewalAttemptStatus) { return this.subscriptions.adminRenewalAttempts(status) }
  @Post('renewal-attempts/:id/retry') async retryRenewal(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.subscriptions.retryRenewalAttempt(id); await this.audit(admin.id, request, 'subscription.renewal.retry', id, result); return result }
  @Post('grant') async grant(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: GrantSubscriptionDto) { const result = await this.subscriptions.grant(body.userId, body.planId, body.days); await this.audit(admin.id, request, 'subscription.grant', result.id, result); return result }
  @Post(':id/terminate') async terminate(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.subscriptions.terminate(id); await this.audit(admin.id, request, 'subscription.terminate', id, result); return result }
  @Post('orders/:id/mark-paid') async markPaid(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.subscriptions.markPaid(id); await this.audit(admin.id, request, 'subscription.order.mark_paid', id, result); return result }
  @Post('orders/:id/cancel') async cancelOrder(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.subscriptions.cancelOrder(id); await this.audit(admin.id, request, 'subscription.order.cancel', id, result); return result }

  private async audit(actorId: string, request: FastifyRequest, action: string, targetId: string, after: unknown) {
    await this.prisma.auditLog.create({ data: { actorId, action, targetType: 'subscription', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } })
  }
}
