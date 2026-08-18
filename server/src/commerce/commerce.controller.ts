import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { CouponDiscountType, Prisma } from '@prisma/client'
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import type { FastifyRequest } from 'fastify'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { CommerceService } from './commerce.service'

class PromotionProductDto { @IsString() planId!: string; @IsInt() @Min(1) @Max(100000000) promotionalPriceCents!: number }
class PromotionDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(40) label?: string
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsDateString() startsAt!: string
  @IsDateString() endsAt!: string
  @IsArray() @ValidateNested({ each: true }) @Type(() => PromotionProductDto) products!: PromotionProductDto[]
}
class CouponDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string
  @IsString() @MinLength(1) @MaxLength(100) name!: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsEnum(CouponDiscountType) discountType!: CouponDiscountType
  @IsInt() @Min(1) @Max(100000000) discountValue!: number
  @IsOptional() @IsInt() @Min(0) @Max(100000000) minimumSpendCents?: number
  @IsOptional() @IsInt() @Min(1) @Max(100000000) maximumDiscountCents?: number | null
  @IsOptional() @IsBoolean() stackWithPromotion?: boolean
  @IsOptional() @IsBoolean() claimEnabled?: boolean
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsInt() @Min(1) @Max(100000000) totalLimit?: number | null
  @IsOptional() @IsInt() @Min(1) @Max(1000) perUserLimit?: number
  @IsOptional() @IsInt() @Min(1) @Max(3650) validDays?: number | null
  @IsOptional() @IsDateString() startsAt?: string | null
  @IsOptional() @IsDateString() endsAt?: string | null
  @IsOptional() @IsArray() @IsString({ each: true }) planIds?: string[]
}
class ClaimDto { @IsString() templateId!: string }
class GrantDto extends ClaimDto { @IsString() userId!: string }
class QuoteDto { @IsString() planId!: string; @IsOptional() @IsString() userCouponId?: string }

@Controller('commerce')
@UseGuards(AuthGuard)
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('coupons') wallet(@CurrentUser() user: AuthenticatedUser) { return this.commerce.wallet(user.id) }
  @Post('coupons/claim') claim(@CurrentUser() user: AuthenticatedUser, @Body() body: ClaimDto) { return this.commerce.claim(user.id, body.templateId) }
  @Post('quote') quote(@CurrentUser() user: AuthenticatedUser, @Body() body: QuoteDto) { return this.commerce.quote(user.id, body.planId, body.userCouponId) }
}

@Controller('admin/commerce')
@UseGuards(AuthGuard, AdminGuard)
export class AdminCommerceController {
  constructor(private readonly commerce: CommerceService, private readonly prisma: PrismaService) {}
  @Get('promotions') promotions() { return this.commerce.listPromotions() }
  @Post('promotions') savePromotion(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest, @Body() body: PromotionDto) { return this.withAudit(user.id, req, 'promotion.create', '', () => this.commerce.savePromotion({ ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) })) }
  @Patch('promotions/:id') updatePromotion(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest, @Param('id') id: string, @Body() body: PromotionDto) { return this.withAudit(user.id, req, 'promotion.update', id, () => this.commerce.savePromotion({ ...body, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) }, id)) }
  @Delete('promotions/:id') deletePromotion(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest, @Param('id') id: string) { return this.withAudit(user.id, req, 'promotion.delete', id, () => this.commerce.deletePromotion(id)) }
  @Get('coupon-templates') coupons() { return this.commerce.listCouponTemplates() }
  @Post('coupon-templates') saveCoupon(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest, @Body() body: CouponDto) { return this.withAudit(user.id, req, 'coupon.create', '', () => this.commerce.saveCouponTemplate(this.couponInput(body))) }
  @Patch('coupon-templates/:id') updateCoupon(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest, @Param('id') id: string, @Body() body: CouponDto) { return this.withAudit(user.id, req, 'coupon.update', id, () => this.commerce.saveCouponTemplate(this.couponInput(body), id)) }
  @Delete('coupon-templates/:id') deleteCoupon(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest, @Param('id') id: string) { return this.withAudit(user.id, req, 'coupon.delete', id, () => this.commerce.deleteCouponTemplate(id)) }
  @Post('coupons/grant') grant(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest, @Body() body: GrantDto) { return this.withAudit(user.id, req, 'coupon.grant', body.userId, () => this.commerce.grantCoupon(body.userId, body.templateId)) }

  private couponInput(body: CouponDto) { return { ...body, startsAt: body.startsAt ? new Date(body.startsAt) : null, endsAt: body.endsAt ? new Date(body.endsAt) : null } }
  private async withAudit<T>(actorId: string, request: FastifyRequest, action: string, targetId: string, operation: () => Promise<T>) { const result = await operation(); await this.prisma.auditLog.create({ data: { actorId, action, targetType: 'commerce', targetId: targetId || (result as { id?: string })?.id || '', ipAddress: request.ip, userAgent: request.headers['user-agent'], after: result as Prisma.InputJsonValue } }); return result }
}
