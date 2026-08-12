import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { PlanBillingCycle, Prisma, SubscriptionStatus } from '@prisma/client'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'

type PlanInput = {
  code: string
  name: string
  description?: string
  billingCycle?: PlanBillingCycle
  priceCents?: number
  originalPriceCents?: number | null
  currency?: string
  includedCredits?: number
  trialDays?: number
  concurrency?: number
  allowByok?: boolean
  apiAccess?: boolean
  imageAccess?: boolean
  videoAccess?: boolean
  commerceAccess?: boolean
  batchAccess?: boolean
  enabled?: boolean
  recommended?: boolean
  sortOrder?: number
  capabilities?: Record<string, unknown>
}

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService) {}

  async onModuleInit() {
    if (await this.prisma.subscriptionPlan.count()) return
    await this.prisma.subscriptionPlan.createMany({ data: [
      { code: 'free', name: '免费版', description: '适合体验基础对话和图片创作', billingCycle: 'MONTHLY', priceCents: 0, includedCredits: 0, trialDays: 0, concurrency: 1, allowByok: true, imageAccess: true, commerceAccess: false, sortOrder: 10 },
      { code: 'plus', name: 'Plus', description: '适合持续创作，包含更高并发和商品视觉', billingCycle: 'MONTHLY', priceCents: 6800, includedCredits: 500, trialDays: 7, concurrency: 3, allowByok: true, imageAccess: true, videoAccess: true, commerceAccess: true, recommended: true, sortOrder: 20 },
      { code: 'pro', name: 'Pro', description: '面向专业团队和高频生成任务', billingCycle: 'MONTHLY', priceCents: 19800, includedCredits: 2000, trialDays: 0, concurrency: 10, allowByok: true, apiAccess: true, imageAccess: true, videoAccess: true, commerceAccess: true, batchAccess: true, sortOrder: 30 },
    ] })
  }

  listPlans(includeDisabled = false) {
    return this.prisma.subscriptionPlan.findMany({ where: includeDisabled ? {} : { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] })
  }

  createPlan(input: PlanInput) {
    const { capabilities, ...plan } = input
    const data = { ...plan, code: plan.code.trim().toLowerCase(), name: plan.name.trim(), description: plan.description?.trim(), ...(capabilities === undefined ? {} : { capabilities: capabilities as Prisma.InputJsonValue }) } as Prisma.SubscriptionPlanUncheckedCreateInput
    return this.prisma.subscriptionPlan.create({ data })
  }

  async updatePlan(id: string, input: Partial<PlanInput>) {
    const { capabilities, ...plan } = input
    const data = { ...plan, code: plan.code?.trim().toLowerCase(), name: plan.name?.trim(), description: plan.description?.trim(), ...(capabilities === undefined ? {} : { capabilities: capabilities as Prisma.InputJsonValue }) } as Prisma.SubscriptionPlanUncheckedUpdateInput
    return this.prisma.subscriptionPlan.update({ where: { id }, data }).catch(() => { throw new NotFoundException('订阅套餐不存在') })
  }

  async deletePlan(id: string) {
    const used = await this.prisma.userSubscription.count({ where: { planId: id } })
    if (used) return this.prisma.subscriptionPlan.update({ where: { id }, data: { enabled: false } })
    await this.prisma.subscriptionPlan.delete({ where: { id } }).catch(() => { throw new NotFoundException('订阅套餐不存在') })
    return { deleted: true }
  }

  async current(userId: string) {
    const now = new Date()
    await this.prisma.userSubscription.updateMany({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { lt: now } }, data: { status: 'EXPIRED', endedAt: now } })
    return this.prisma.userSubscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' }, include: { plan: true } })
  }

  orders(userId: string) {
    return this.prisma.subscriptionOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { plan: { select: { name: true, billingCycle: true } } } })
  }

  async createOrder(userId: string, planId: string, paymentMethod: string) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.subscriptionsEnabled) throw new BadRequestException('订阅购买当前未开放')
    const plan = await this.prisma.subscriptionPlan.findFirst({ where: { id: planId, enabled: true } })
    if (!plan) throw new NotFoundException('订阅套餐不存在或已下架')
    if (plan.priceCents <= 0) throw new BadRequestException('免费套餐无需创建购买订单')
    const pending = await this.prisma.subscriptionOrder.findFirst({ where: { userId, planId: plan.id, paymentMethod, amountCents: plan.priceCents, currency: plan.currency, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, include: { plan: true } })
    if (pending) return pending
    return this.prisma.subscriptionOrder.create({ data: { userId, planId: plan.id, amountCents: plan.priceCents, currency: plan.currency, paymentMethod }, include: { plan: true } })
  }

  async startTrial(userId: string, requestedPlanId?: string) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.trialEnabled) throw new BadRequestException('免费试用当前未开放')
    if (await this.current(userId)) throw new BadRequestException('当前已有生效中的套餐')
    const previousTrial = await this.prisma.userSubscription.count({ where: { userId, status: { in: ['TRIALING', 'EXPIRED', 'CANCELLED'] }, trialEndsAt: { not: null } } })
    if (previousTrial) throw new BadRequestException('该账户已经使用过免费试用')
    const planId = requestedPlanId || settings.defaultTrialPlanId || undefined
    const plan = planId
      ? await this.prisma.subscriptionPlan.findFirst({ where: { id: planId, enabled: true, trialDays: { gt: 0 } } })
      : await this.prisma.subscriptionPlan.findFirst({ where: { enabled: true, trialDays: { gt: 0 } }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] })
    if (!plan) throw new BadRequestException('管理员尚未配置可试用套餐')
    const now = new Date()
    const endsAt = new Date(now.getTime() + plan.trialDays * 86_400_000)
    const subscription = await this.prisma.userSubscription.create({ data: { userId, planId: plan.id, status: 'TRIALING', startsAt: now, currentPeriodStart: now, currentPeriodEnd: endsAt, trialEndsAt: endsAt }, include: { plan: true } })
    const credits = settings.trialCredits
    try {
      if (credits > 0) await this.credits.mutate(userId, credits, 'GRANT', `${plan.name} 免费试用`, `subscription:${subscription.id}:trial`, { type: 'subscription', id: subscription.id })
    } catch (error) {
      await this.prisma.userSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined)
      throw error
    }
    return subscription
  }

  async cancel(userId: string) {
    const subscription = await this.current(userId)
    if (!subscription) throw new NotFoundException('当前没有生效中的套餐')
    if (subscription.status === SubscriptionStatus.TRIALING) return this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), endedAt: new Date() }, include: { plan: true } })
    return this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true, cancelledAt: new Date() }, include: { plan: true } })
  }

  adminOrders() {
    return this.prisma.subscriptionOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 300, include: { user: { select: { id: true, email: true, displayName: true } }, plan: true } })
  }

  adminSubscriptions() {
    return this.prisma.userSubscription.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' }, take: 300, include: { user: { select: { id: true, email: true, displayName: true } }, plan: true } })
  }

  async grant(userId: string, planId: string, days?: number) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, status: 'ACTIVE' }, select: { id: true } }),
      this.prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
    ])
    if (!user) throw new NotFoundException('用户不存在或已停用')
    if (!plan) throw new NotFoundException('订阅套餐不存在')
    const now = new Date()
    const periodEnd = days ? new Date(now.getTime() + days * 86_400_000) : this.periodEnd(now, plan.billingCycle)
    await this.prisma.userSubscription.updateMany({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } }, data: { status: 'CANCELLED', endedAt: now } })
    const subscription = await this.prisma.userSubscription.create({ data: { userId, planId, status: 'ACTIVE', startsAt: now, currentPeriodStart: now, currentPeriodEnd: periodEnd, metadata: { source: 'admin_grant' } }, include: { user: { select: { id: true, email: true, displayName: true } }, plan: true } })
    try {
      if (plan.includedCredits > 0) await this.credits.mutate(userId, plan.includedCredits, 'GRANT', `${plan.name} 管理员开通额度`, `subscription:${subscription.id}:admin-grant`, { type: 'subscription', id: subscription.id })
    } catch (error) {
      await this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED', endedAt: new Date() } }).catch(() => undefined)
      throw error
    }
    return subscription
  }

  async terminate(id: string) {
    const result = await this.prisma.userSubscription.updateMany({ where: { id, status: { in: ['ACTIVE', 'TRIALING'] } }, data: { status: 'CANCELLED', cancelledAt: new Date(), endedAt: new Date() } })
    if (!result.count) throw new BadRequestException('订阅不存在或已经结束')
    return { terminated: true }
  }

  async markPaid(orderId: string) {
    const result = await this.withSerializableRetry(async (tx) => {
      const order = await tx.subscriptionOrder.findUnique({ where: { id: orderId }, include: { plan: true } })
      if (!order) throw new NotFoundException('订阅订单不存在')
      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') throw new BadRequestException('该订单当前状态不能确认到账')
      const existing = await tx.userSubscription.findFirst({ where: { metadata: { path: ['orderId'], equals: order.id } }, include: { plan: true } })
      if (existing) {
        if (order.status !== 'PAID') await tx.subscriptionOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: order.paidAt || new Date() } })
        return { subscription: existing, order }
      }
      const now = new Date()
      const periodEnd = this.periodEnd(now, order.plan.billingCycle)
      await tx.userSubscription.updateMany({ where: { userId: order.userId, status: { in: ['ACTIVE', 'TRIALING'] } }, data: { status: 'CANCELLED', endedAt: now } })
      const subscription = await tx.userSubscription.create({ data: { userId: order.userId, planId: order.planId, status: 'ACTIVE', startsAt: now, currentPeriodStart: now, currentPeriodEnd: periodEnd, metadata: { orderId: order.id } }, include: { plan: true } })
      await tx.subscriptionOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: order.paidAt || now } })
      return { subscription, order }
    })
    if (result.order.plan.includedCredits > 0) await this.credits.mutate(result.order.userId, result.order.plan.includedCredits, 'PURCHASE', `${result.order.plan.name} 套餐额度`, `subscription:${result.subscription.id}:credits`, { type: 'subscription', id: result.subscription.id })
    return result.subscription
  }

  async cancelOrder(orderId: string) {
    const result = await this.prisma.subscriptionOrder.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    if (!result.count) throw new BadRequestException('只能取消待支付订单')
    return { cancelled: true }
  }

  private periodEnd(from: Date, cycle: PlanBillingCycle) {
    const result = new Date(from)
    if (cycle === PlanBillingCycle.MONTHLY) result.setUTCMonth(result.getUTCMonth() + 1)
    else if (cycle === PlanBillingCycle.YEARLY) result.setUTCFullYear(result.getUTCFullYear() + 1)
    else result.setUTCFullYear(result.getUTCFullYear() + 100)
    return result
  }

  private async withSerializableRetry<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error
      }
    }
    throw new BadRequestException('订阅到账处理繁忙，请稍后重试')
  }
}
