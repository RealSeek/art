import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CouponDiscountType, Prisma, UserCouponStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type PromotionInput = { name: string; label?: string; enabled?: boolean; startsAt: Date; endsAt: Date; products: Array<{ planId: string; promotionalPriceCents: number }> }
type CouponInput = { code: string; name: string; description?: string; discountType: CouponDiscountType; discountValue: number; minimumSpendCents?: number; maximumDiscountCents?: number | null; stackWithPromotion?: boolean; claimEnabled?: boolean; enabled?: boolean; totalLimit?: number | null; perUserLimit?: number; validDays?: number | null; startsAt?: Date | null; endsAt?: Date | null; planIds?: string[] }
type PlanPrice = { id: string; priceCents: number; currency: string; name: string }

@Injectable()
export class CommerceService {
  constructor(private readonly prisma: PrismaService) {}

  async decoratePlans<T extends PlanPrice>(plans: T[]) {
    if (!plans.length) return plans
    const now = new Date()
    const products = await this.prisma.promotionPlan.findMany({
      where: { planId: { in: plans.map((plan) => plan.id) }, campaign: { enabled: true, startsAt: { lte: now }, endsAt: { gt: now } } },
      orderBy: { campaign: { startsAt: 'desc' } }, include: { campaign: true },
    })
    const active = new Map<string, typeof products[number]>()
    for (const product of products) if (!active.has(product.planId)) active.set(product.planId, product)
    return plans.map((plan) => {
      const product = active.get(plan.id)
      return { ...plan, effectivePriceCents: product?.promotionalPriceCents ?? plan.priceCents, promotion: product ? { id: product.campaign.id, name: product.campaign.name, label: product.campaign.label, endsAt: product.campaign.endsAt } : null }
    })
  }

  listPromotions() {
    return this.prisma.promotionCampaign.findMany({ orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }], include: { products: { include: { plan: { select: { id: true, name: true, code: true, priceCents: true } } } }, _count: { select: { orders: true } } } })
  }

  async savePromotion(input: PromotionInput, id?: string) {
    if (input.endsAt <= input.startsAt) throw new BadRequestException('促销结束时间必须晚于开始时间')
    if (!input.products.length) throw new BadRequestException('促销活动至少需要一个套餐商品')
    const planIds = [...new Set(input.products.map((item) => item.planId))]
    if (planIds.length !== input.products.length) throw new BadRequestException('同一促销中不能重复选择套餐')
    const plans = await this.prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, priceCents: true } })
    if (plans.length !== planIds.length) throw new BadRequestException('包含不存在的套餐商品')
    const prices = new Map(plans.map((plan) => [plan.id, plan.priceCents]))
    for (const item of input.products) if (item.promotionalPriceCents < 1 || item.promotionalPriceCents >= (prices.get(item.planId) || 0)) throw new BadRequestException('促销价格必须大于 0 且低于套餐日常价')
    if (input.enabled !== false) {
      const overlap = await this.prisma.promotionPlan.findFirst({ where: { planId: { in: planIds }, campaign: { id: id ? { not: id } : undefined, enabled: true, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } }, include: { campaign: true, plan: true } })
      if (overlap) throw new BadRequestException(`${overlap.plan.name} 已在“${overlap.campaign.name}”的有效期内参与促销`)
    }
    return this.prisma.$transaction(async (tx) => {
      const data = { name: input.name.trim(), label: input.label?.trim() || '', enabled: input.enabled ?? true, startsAt: input.startsAt, endsAt: input.endsAt }
      const campaign = id
        ? await tx.promotionCampaign.update({ where: { id }, data })
        : await tx.promotionCampaign.create({ data })
      if (id) await tx.promotionPlan.deleteMany({ where: { campaignId: id } })
      await tx.promotionPlan.createMany({ data: input.products.map((item) => ({ campaignId: campaign.id, planId: item.planId, promotionalPriceCents: item.promotionalPriceCents })) })
      return tx.promotionCampaign.findUniqueOrThrow({ where: { id: campaign.id }, include: { products: { include: { plan: true } } } })
    })
  }

  async deletePromotion(id: string) {
    const campaign = await this.prisma.promotionCampaign.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } })
    if (!campaign) throw new NotFoundException('促销活动不存在')
    if (campaign._count.orders) return this.prisma.promotionCampaign.update({ where: { id }, data: { enabled: false } })
    await this.prisma.promotionCampaign.delete({ where: { id } })
    return { deleted: true }
  }

  listCouponTemplates() {
    return this.prisma.couponTemplate.findMany({ orderBy: { createdAt: 'desc' }, include: { products: { include: { plan: { select: { id: true, name: true, code: true } } } }, _count: { select: { userCoupons: true } } } })
  }

  async saveCouponTemplate(input: CouponInput, id?: string) {
    this.validateCoupon(input)
    const planIds = [...new Set(input.planIds || [])]
    if (planIds.length && await this.prisma.subscriptionPlan.count({ where: { id: { in: planIds } } }) !== planIds.length) throw new BadRequestException('包含不存在的套餐商品')
    const data = {
      code: input.code.trim().toUpperCase(), name: input.name.trim(), description: input.description?.trim() || '', discountType: input.discountType,
      discountValue: input.discountValue, minimumSpendCents: input.minimumSpendCents || 0, maximumDiscountCents: input.maximumDiscountCents || null,
      stackWithPromotion: input.stackWithPromotion ?? true, claimEnabled: input.claimEnabled ?? true, enabled: input.enabled ?? true,
      totalLimit: input.totalLimit || null, perUserLimit: input.perUserLimit || 1, validDays: input.validDays || null, startsAt: input.startsAt || null, endsAt: input.endsAt || null,
    }
    return this.prisma.$transaction(async (tx) => {
      const template = id ? await tx.couponTemplate.update({ where: { id }, data }) : await tx.couponTemplate.create({ data })
      if (id) await tx.couponTemplatePlan.deleteMany({ where: { templateId: id } })
      if (planIds.length) await tx.couponTemplatePlan.createMany({ data: planIds.map((planId) => ({ templateId: template.id, planId })) })
      return tx.couponTemplate.findUniqueOrThrow({ where: { id: template.id }, include: { products: { include: { plan: true } } } })
    })
  }

  async deleteCouponTemplate(id: string) {
    const template = await this.prisma.couponTemplate.findUnique({ where: { id }, include: { _count: { select: { userCoupons: true } } } })
    if (!template) throw new NotFoundException('优惠券模板不存在')
    if (template._count.userCoupons) return this.prisma.couponTemplate.update({ where: { id }, data: { enabled: false, claimEnabled: false } })
    await this.prisma.couponTemplate.delete({ where: { id } })
    return { deleted: true }
  }

  async wallet(userId: string) {
    const now = new Date()
    await this.prisma.userCoupon.updateMany({ where: { userId, status: 'AVAILABLE', expiresAt: { lte: now } }, data: { status: 'EXPIRED' } })
    const [coupons, templates] = await Promise.all([
      this.prisma.userCoupon.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { template: { include: { products: true } } } }),
      this.prisma.couponTemplate.findMany({ where: { enabled: true, claimEnabled: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] }, orderBy: { createdAt: 'desc' }, take: 50, include: { products: true } }),
    ])
    const counts = await this.prisma.userCoupon.groupBy({ by: ['templateId'], where: { userId }, _count: true })
    const claimed = new Map(counts.map((item) => [item.templateId, item._count]))
    return { coupons, templates: templates.filter((item) => (!item.totalLimit || item.issuedCount < item.totalLimit) && (claimed.get(item.id) || 0) < item.perUserLimit).map((item) => ({ ...item, claimedCount: claimed.get(item.id) || 0 })) }
  }

  claim(userId: string, templateId: string) { return this.issueCoupon(userId, templateId, true) }
  grantCoupon(userId: string, templateId: string) { return this.issueCoupon(userId, templateId, false) }

  async quote(userId: string, planId: string, userCouponId?: string) {
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: planId, enabled: true }, select: { id: true, name: true, priceCents: true, currency: true } })
    if (!plan) throw new NotFoundException('订阅套餐不存在或已下架')
    return this.quotePlan(this.prisma, userId, plan, userCouponId)
  }

  async quotePlan(client: Prisma.TransactionClient | PrismaService, userId: string, plan: PlanPrice, userCouponId?: string) {
    const now = new Date()
    const promotionProduct = await client.promotionPlan.findFirst({ where: { planId: plan.id, campaign: { enabled: true, startsAt: { lte: now }, endsAt: { gt: now } } }, orderBy: { campaign: { startsAt: 'desc' } }, include: { campaign: true } })
    let promotionDiscountCents = promotionProduct ? plan.priceCents - promotionProduct.promotionalPriceCents : 0
    let couponDiscountCents = 0
    let appliedCoupon: { id: string; templateId: string; name: string; code: string } | null = null
    let couponMessage = ''
    if (userCouponId) {
      const coupon = await client.userCoupon.findFirst({ where: { id: userCouponId, userId }, include: { template: { include: { products: true } } } })
      if (!coupon) throw new NotFoundException('优惠券不存在')
      this.assertCouponUsable(coupon, plan.id, now)
      const template = coupon.template
      const promotionalAmount = plan.priceCents - promotionDiscountCents
      const couponBase = template.stackWithPromotion ? promotionalAmount : plan.priceCents
      if (couponBase < template.minimumSpendCents) throw new BadRequestException(`订单金额未达到优惠券使用门槛 ¥${(template.minimumSpendCents / 100).toFixed(2)}`)
      couponDiscountCents = this.discount(template.discountType, template.discountValue, couponBase, template.maximumDiscountCents)
      if (!template.stackWithPromotion && promotionDiscountCents >= couponDiscountCents) {
        couponMessage = '当前促销优惠更大，优惠券未锁定，可留待下次使用'
        couponDiscountCents = 0
      } else {
        if (!template.stackWithPromotion) promotionDiscountCents = 0
        appliedCoupon = { id: coupon.id, templateId: template.id, name: template.name, code: template.code }
      }
    }
    const amountCents = Math.max(1, plan.priceCents - promotionDiscountCents - couponDiscountCents)
    return { planId: plan.id, planName: plan.name, currency: plan.currency, originalAmountCents: plan.priceCents, promotionDiscountCents, couponDiscountCents, amountCents, promotion: promotionDiscountCents && promotionProduct ? { id: promotionProduct.campaign.id, name: promotionProduct.campaign.name, label: promotionProduct.campaign.label, endsAt: promotionProduct.campaign.endsAt } : null, coupon: appliedCoupon, couponMessage }
  }

  async lockCoupon(tx: Prisma.TransactionClient, userCouponId: string, orderId: string) {
    const result = await tx.userCoupon.updateMany({ where: { id: userCouponId, status: 'AVAILABLE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, data: { status: 'LOCKED', lockedOrderId: orderId, lockedAt: new Date() } })
    if (result.count !== 1) throw new BadRequestException('优惠券状态已变化，请重新报价')
  }

  async releaseCoupon(tx: Prisma.TransactionClient, orderId: string) {
    await tx.userCoupon.updateMany({ where: { lockedOrderId: orderId, status: 'LOCKED' }, data: { status: 'AVAILABLE', lockedOrderId: null, lockedAt: null } })
  }

  async redeemCoupon(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.subscriptionOrder.findUnique({ where: { id: orderId }, select: { userCouponId: true, couponDiscountCents: true } })
    if (!order?.userCouponId || !order.couponDiscountCents) return
    const now = new Date()
    const updated = await tx.userCoupon.updateMany({ where: { id: order.userCouponId, status: 'LOCKED', lockedOrderId: orderId }, data: { status: 'REDEEMED', redeemedAt: now, lockedOrderId: null, lockedAt: null } })
    if (updated.count !== 1) throw new BadRequestException('优惠券锁定状态异常，无法确认到账')
    await tx.couponRedemption.upsert({ where: { orderId }, create: { orderId, userCouponId: order.userCouponId, discountCents: order.couponDiscountCents, redeemedAt: now }, update: { status: 'REDEEMED', refundedAt: null } })
    const coupon = await tx.userCoupon.findUniqueOrThrow({ where: { id: order.userCouponId }, select: { templateId: true } })
    await tx.couponTemplate.update({ where: { id: coupon.templateId }, data: { redeemedCount: { increment: 1 } } })
  }

  async markCouponRefunded(tx: Prisma.TransactionClient, orderId: string) {
    const redemption = await tx.couponRedemption.findUnique({ where: { orderId }, include: { userCoupon: true } })
    if (!redemption || redemption.status === 'REFUNDED') return
    await tx.couponRedemption.update({ where: { id: redemption.id }, data: { status: 'REFUNDED', refundedAt: new Date() } })
  }

  private async issueCoupon(userId: string, templateId: string, publicClaim: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CouponTemplate" WHERE id = ${templateId} FOR UPDATE`
      const template = await tx.couponTemplate.findUnique({ where: { id: templateId } })
      if (!template || !template.enabled || (publicClaim && !template.claimEnabled)) throw new NotFoundException('优惠券不存在或不可领取')
      const now = new Date()
      if (template.startsAt && template.startsAt > now || template.endsAt && template.endsAt <= now) throw new BadRequestException('优惠券不在领取期内')
      if (template.totalLimit && template.issuedCount >= template.totalLimit) throw new BadRequestException('优惠券已领完')
      const userCount = await tx.userCoupon.count({ where: { templateId, userId } })
      if (userCount >= template.perUserLimit) throw new BadRequestException('已达到每人领取上限')
      const expiresAt = template.validDays ? new Date(now.getTime() + template.validDays * 86_400_000) : template.endsAt
      const coupon = await tx.userCoupon.create({ data: { userId, templateId, validFrom: now, expiresAt } })
      await tx.couponTemplate.update({ where: { id: templateId }, data: { issuedCount: { increment: 1 } } })
      return tx.userCoupon.findUniqueOrThrow({ where: { id: coupon.id }, include: { template: true } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  private validateCoupon(input: CouponInput) {
    if (!input.code.trim() || !input.name.trim()) throw new BadRequestException('请填写优惠券代码和名称')
    if (input.discountType === 'FIXED' && input.discountValue < 1) throw new BadRequestException('固定优惠金额必须大于 0')
    if (input.discountType === 'PERCENT' && (input.discountValue < 1 || input.discountValue > 10000)) throw new BadRequestException('折扣比例必须在 0.01% 到 100% 之间')
    if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) throw new BadRequestException('结束时间必须晚于开始时间')
    if ((input.perUserLimit || 1) < 1) throw new BadRequestException('每人限领至少为 1')
  }

  private assertCouponUsable(coupon: { status: UserCouponStatus; validFrom: Date; expiresAt: Date | null; template: { enabled: boolean; startsAt: Date | null; endsAt: Date | null; products: Array<{ planId: string }> } }, planId: string, now: Date) {
    if (coupon.status !== 'AVAILABLE') throw new BadRequestException('优惠券当前不可使用')
    if (coupon.validFrom > now || coupon.expiresAt && coupon.expiresAt <= now) throw new BadRequestException('优惠券未生效或已过期')
    if (!coupon.template.enabled || coupon.template.startsAt && coupon.template.startsAt > now || coupon.template.endsAt && coupon.template.endsAt <= now) throw new BadRequestException('优惠券模板已停用或过期')
    if (coupon.template.products.length && !coupon.template.products.some((item) => item.planId === planId)) throw new BadRequestException('优惠券不适用于当前套餐')
  }

  private discount(type: CouponDiscountType, value: number, base: number, maximum: number | null) {
    const raw = type === 'FIXED' ? value : Math.floor(base * value / 10000)
    return Math.min(Math.max(0, raw), maximum || Number.MAX_SAFE_INTEGER, Math.max(0, base - 1))
  }
}
