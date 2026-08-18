import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { PlanBillingCycle, Prisma, RenewalAttemptStatus, SubscriptionStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import { CreditsService } from '../credits/credits.service'
import { CommerceService } from '../commerce/commerce.service'
import { NotificationsService } from '../notifications/notifications.service'
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly commerce: CommerceService,
    private readonly notifications: NotificationsService,
    @InjectQueue('subscription-lifecycle') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    if (!await this.prisma.subscriptionPlan.count()) {
      await this.prisma.subscriptionPlan.createMany({ data: [
        { code: 'free', name: '免费版', description: '适合体验基础对话和图片创作', billingCycle: 'MONTHLY', priceCents: 0, includedCredits: 0, trialDays: 0, concurrency: 1, allowByok: true, imageAccess: true, commerceAccess: false, sortOrder: 10 },
        { code: 'plus', name: 'Plus', description: '适合持续创作，包含更高并发和商品视觉', billingCycle: 'MONTHLY', priceCents: 6800, includedCredits: 500, trialDays: 7, concurrency: 3, allowByok: true, imageAccess: true, videoAccess: true, commerceAccess: true, recommended: true, sortOrder: 20 },
        { code: 'pro', name: 'Pro', description: '面向专业团队和高频生成任务', billingCycle: 'MONTHLY', priceCents: 19800, includedCredits: 2000, trialDays: 0, concurrency: 10, allowByok: true, apiAccess: true, imageAccess: true, videoAccess: true, commerceAccess: true, batchAccess: true, sortOrder: 30 },
      ] })
    }
    await this.queue.upsertJobScheduler('subscription-renewal-scan', { every: 15 * 60_000 }, { name: 'scan-renewals', data: {}, opts: { removeOnComplete: 20, removeOnFail: 100 } })
  }

  async listPlans(includeDisabled = false) {
    const plans = await this.prisma.subscriptionPlan.findMany({ where: includeDisabled ? {} : { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] })
    return includeDisabled ? plans : this.commerce.decoratePlans(plans)
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
    await this.prisma.userSubscription.updateMany({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { lt: now }, OR: [{ cancelAtPeriodEnd: true }, { autoRenewEnabled: false }] }, data: { status: 'EXPIRED', endedAt: now } })
    await this.prisma.userSubscription.updateMany({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { lt: now }, autoRenewEnabled: true, cancelAtPeriodEnd: false }, data: { status: 'PAST_DUE', graceEndsAt: new Date(now.getTime() + 3 * 86_400_000) } })
    await this.prisma.userSubscription.updateMany({ where: { userId, status: 'PAST_DUE', graceEndsAt: { lt: now } }, data: { status: 'EXPIRED', endedAt: now, autoRenewEnabled: false } })
    return this.prisma.userSubscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, orderBy: { createdAt: 'desc' }, include: { plan: true, renewalChannel: { select: { id: true, name: true, providerKey: true } } } })
  }

  orders(userId: string) {
    return this.prisma.subscriptionOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { plan: { select: { name: true, billingCycle: true } } } })
  }

  async createOrder(userId: string, planId: string, paymentMethod: string, userCouponId?: string) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.subscriptionsEnabled) throw new BadRequestException('订阅购买当前未开放')
    return this.withSerializableRetry(async (tx) => {
      if (userCouponId) {
        const existing = await tx.subscriptionOrder.findFirst({ where: { userId, planId, userCouponId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, include: { plan: true } })
        if (existing) return existing
      }
      const plan = await tx.subscriptionPlan.findFirst({ where: { id: planId, enabled: true } })
      if (!plan) throw new NotFoundException('订阅套餐不存在或已下架')
      if (plan.priceCents <= 0) throw new BadRequestException('免费套餐无需创建购买订单')
      const quote = await this.commerce.quotePlan(tx, userId, plan, userCouponId)
      const pending = !quote.coupon ? await tx.subscriptionOrder.findFirst({ where: { userId, planId: plan.id, paymentMethod, amountCents: quote.amountCents, currency: plan.currency, status: 'PENDING', userCouponId: null, promotionId: quote.promotion?.id || null }, orderBy: { createdAt: 'desc' }, include: { plan: true } }) : null
      if (pending) return pending
      const order = await tx.subscriptionOrder.create({ data: {
        userId, planId: plan.id, amountCents: quote.amountCents, originalAmountCents: quote.originalAmountCents,
        promotionDiscountCents: quote.promotionDiscountCents, couponDiscountCents: quote.couponDiscountCents,
        currency: plan.currency, paymentMethod, promotionId: quote.promotion?.id || null, userCouponId: quote.coupon?.id || null,
        priceSnapshot: quote as Prisma.InputJsonValue,
      }, include: { plan: true } })
      if (quote.coupon) await this.commerce.lockCoupon(tx, quote.coupon.id, order.id)
      return order
    })
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
    if (subscription.status === SubscriptionStatus.TRIALING) return this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), endedAt: new Date(), autoRenewEnabled: false, nextRenewalAt: null }, include: { plan: true } })
    return this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true, cancelledAt: new Date(), autoRenewEnabled: false, nextRenewalAt: null }, include: { plan: true } })
  }

  async renewalOptions(userId: string) {
    const subscription = await this.current(userId)
    const channels = await this.prisma.paymentChannel.findMany({ where: { enabled: true }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }], select: { id: true, name: true, providerKey: true, supportedMethods: true } })
    return { subscription, channels, mode: 'PAYMENT_LINK', automaticChargeSupported: false, graceDays: 3, reminderDays: 3 }
  }

  async configureRenewal(userId: string, enabled: boolean, channelId?: string) {
    const subscription = await this.current(userId)
    if (!subscription) throw new NotFoundException('当前没有可续费套餐')
    if (subscription.plan.priceCents <= 0 || subscription.plan.billingCycle === PlanBillingCycle.ONE_TIME) throw new BadRequestException('当前套餐不支持周期续费')
    let channel: { id: string } | null = null
    if (enabled) {
      channel = channelId
        ? await this.prisma.paymentChannel.findFirst({ where: { id: channelId, enabled: true }, select: { id: true } })
        : await this.prisma.paymentChannel.findFirst({ where: { enabled: true }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }], select: { id: true } })
      if (!channel) throw new BadRequestException('当前没有可用支付渠道')
    }
    const nextRenewalAt = enabled && subscription.currentPeriodEnd ? this.renewalReminderAt(subscription.currentPeriodEnd) : null
    return this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { autoRenewEnabled: enabled, renewalChannelId: channel?.id || null, nextRenewalAt, cancelAtPeriodEnd: false, cancelledAt: null }, include: { plan: true, renewalChannel: { select: { id: true, name: true, providerKey: true } } } })
  }

  renewalAttempts(userId: string) {
    return this.prisma.subscriptionRenewalAttempt.findMany({ where: { subscription: { userId } }, orderBy: { createdAt: 'desc' }, take: 100, include: { subscription: { include: { plan: true } } } })
  }

  adminRenewalAttempts(status?: RenewalAttemptStatus) {
    return this.prisma.subscriptionRenewalAttempt.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'desc' }, take: 500, include: { subscription: { include: { plan: true, user: { select: { id: true, displayName: true, email: true } } } } } })
  }

  async processDueRenewals() {
    const now = new Date()
    const due = await this.prisma.userSubscription.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }, autoRenewEnabled: true, cancelAtPeriodEnd: false, nextRenewalAt: { lte: now } }, orderBy: { nextRenewalAt: 'asc' }, take: 100, include: { plan: true, renewalChannel: true } })
    const results = await Promise.allSettled(due.map((subscription) => this.createRenewalAttempt(subscription.id)))
    await this.prisma.userSubscription.updateMany({ where: { status: 'PAST_DUE', graceEndsAt: { lt: now } }, data: { status: 'EXPIRED', endedAt: now, autoRenewEnabled: false, nextRenewalAt: null } })
    return { attempted: due.length, created: results.filter((item) => item.status === 'fulfilled').length }
  }

  async retryRenewalAttempt(id: string) {
    const attempt = await this.prisma.subscriptionRenewalAttempt.findUnique({ where: { id }, include: { subscription: true } })
    if (!attempt) throw new NotFoundException('续费尝试不存在')
    if (attempt.status !== RenewalAttemptStatus.FAILED && attempt.status !== RenewalAttemptStatus.PAYMENT_REQUIRED) throw new BadRequestException('当前续费状态不能重试')
    if (attempt.orderId) {
      const order = await this.prisma.subscriptionOrder.findUnique({ where: { id: attempt.orderId } })
      if (order?.status === 'PENDING') return attempt
    }
    await this.prisma.userSubscription.update({ where: { id: attempt.subscriptionId }, data: { autoRenewEnabled: true, nextRenewalAt: new Date() } })
    return this.createRenewalAttempt(attempt.subscriptionId)
  }

  private async createRenewalAttempt(subscriptionId: string) {
    const subscription = await this.prisma.userSubscription.findUnique({ where: { id: subscriptionId }, include: { plan: true, renewalChannel: true, renewalAttempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } } })
    if (!subscription || !subscription.autoRenewEnabled || subscription.cancelAtPeriodEnd) throw new BadRequestException('订阅未启用续费')
    const existing = await this.prisma.subscriptionRenewalAttempt.findFirst({ where: { subscriptionId, status: RenewalAttemptStatus.PAYMENT_REQUIRED, orderId: { not: null } }, orderBy: { createdAt: 'desc' } })
    if (existing?.orderId && await this.prisma.subscriptionOrder.findFirst({ where: { id: existing.orderId, status: 'PENDING' } })) return existing
    const channel = subscription.renewalChannel?.enabled ? subscription.renewalChannel : await this.prisma.paymentChannel.findFirst({ where: { enabled: true }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] })
    const attemptNumber = (subscription.renewalAttempts[0]?.attemptNumber || 0) + 1
    const periodKey = subscription.currentPeriodEnd?.toISOString() || subscription.id
    const attempt = await this.prisma.subscriptionRenewalAttempt.create({ data: { subscriptionId, attemptNumber, idempotencyKey: `${subscription.id}:${periodKey}:${attemptNumber}`, scheduledAt: new Date(), startedAt: new Date(), status: RenewalAttemptStatus.PROCESSING } })
    if (!channel?.supportedMethods.length) {
      await this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { renewalFailureCount: { increment: 1 }, lastRenewalAttemptAt: new Date(), nextRenewalAt: null } })
      return this.prisma.subscriptionRenewalAttempt.update({ where: { id: attempt.id }, data: { status: RenewalAttemptStatus.FAILED, failureReason: '没有可用支付渠道', completedAt: new Date() } })
    }
    const order = await this.prisma.subscriptionOrder.create({ data: { userId: subscription.userId, planId: subscription.planId, amountCents: subscription.plan.priceCents, originalAmountCents: subscription.plan.priceCents, currency: subscription.plan.currency, paymentMethod: channel.supportedMethods[0], metadata: { renewalSubscriptionId: subscription.id, renewalAttemptId: attempt.id }, priceSnapshot: { originalAmountCents: subscription.plan.priceCents, promotionDiscountCents: 0, couponDiscountCents: 0, amountCents: subscription.plan.priceCents, renewal: true } } })
    const result = await this.prisma.subscriptionRenewalAttempt.update({ where: { id: attempt.id }, data: { status: RenewalAttemptStatus.PAYMENT_REQUIRED, orderId: order.id, completedAt: new Date() } })
    await this.prisma.userSubscription.update({ where: { id: subscription.id }, data: { lastRenewalAttemptAt: new Date(), renewalChannelId: channel.id, nextRenewalAt: null, ...(subscription.currentPeriodEnd && subscription.currentPeriodEnd <= new Date() ? { status: 'PAST_DUE', graceEndsAt: new Date(Date.now() + 3 * 86_400_000) } : {}) } })
    await this.notifications.sendCustomToUsers([subscription.userId], '套餐续费待支付', `${subscription.plan.name} 的续费订单已创建，请在套餐与账单中完成支付。`)
    return result
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
      const renewal = await tx.subscriptionRenewalAttempt.findFirst({ where: { orderId: order.id }, include: { subscription: true } })
      if (renewal) {
        if (renewal.status === RenewalAttemptStatus.SUCCEEDED) return { subscription: await tx.userSubscription.findUniqueOrThrow({ where: { id: renewal.subscriptionId }, include: { plan: true } }), order }
        const now = new Date()
        const periodStart = renewal.subscription.currentPeriodEnd && renewal.subscription.currentPeriodEnd > now ? renewal.subscription.currentPeriodEnd : now
        const periodEnd = this.periodEnd(periodStart, order.plan.billingCycle)
        const subscription = await tx.userSubscription.update({ where: { id: renewal.subscriptionId }, data: {
          status: 'ACTIVE', currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, endedAt: null,
          graceEndsAt: null, renewalFailureCount: 0, cancelAtPeriodEnd: false, cancelledAt: null,
          nextRenewalAt: renewal.subscription.autoRenewEnabled ? this.renewalReminderAt(periodEnd) : null,
        }, include: { plan: true } })
        await tx.subscriptionRenewalAttempt.update({ where: { id: renewal.id }, data: { status: RenewalAttemptStatus.SUCCEEDED, transactionId: order.externalOrderId, failureReason: '', completedAt: now } })
        await this.commerce.redeemCoupon(tx, order.id)
        await tx.subscriptionOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: order.paidAt || now } })
        return { subscription, order }
      }
      const existing = await tx.userSubscription.findFirst({ where: { metadata: { path: ['orderId'], equals: order.id } }, include: { plan: true } })
      if (existing) {
        if (order.status !== 'PAID') { await this.commerce.redeemCoupon(tx, order.id); await tx.subscriptionOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: order.paidAt || new Date() } }) }
        return { subscription: existing, order }
      }
      const now = new Date()
      const periodEnd = this.periodEnd(now, order.plan.billingCycle)
      await tx.userSubscription.updateMany({ where: { userId: order.userId, status: { in: ['ACTIVE', 'TRIALING'] } }, data: { status: 'CANCELLED', endedAt: now } })
      const subscription = await tx.userSubscription.create({ data: { userId: order.userId, planId: order.planId, status: 'ACTIVE', startsAt: now, currentPeriodStart: now, currentPeriodEnd: periodEnd, metadata: { orderId: order.id } }, include: { plan: true } })
      await this.commerce.redeemCoupon(tx, order.id)
      await tx.subscriptionOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: order.paidAt || now } })
      return { subscription, order }
    })
    if (result.order.plan.includedCredits > 0) await this.credits.mutate(result.order.userId, result.order.plan.includedCredits, 'PURCHASE', `${result.order.plan.name} 套餐额度`, `subscription-order:${result.order.id}:credits`, { type: 'subscription', id: result.subscription.id })
    return result.subscription
  }

  async cancelOrder(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.subscriptionOrder.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
      if (!result.count) throw new BadRequestException('只能取消待支付订单')
      await this.commerce.releaseCoupon(tx, orderId)
      return { cancelled: true }
    })
  }

  async cancelOwnOrder(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.subscriptionOrder.updateMany({ where: { id: orderId, userId, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
      if (!result.count) throw new BadRequestException('只能取消自己的待支付订单')
      await this.commerce.releaseCoupon(tx, orderId)
      await tx.subscriptionRenewalAttempt.updateMany({ where: { orderId, status: RenewalAttemptStatus.PAYMENT_REQUIRED }, data: { status: RenewalAttemptStatus.CANCELLED, completedAt: new Date() } })
      return { cancelled: true }
    })
  }

  private periodEnd(from: Date, cycle: PlanBillingCycle) {
    const result = new Date(from)
    if (cycle === PlanBillingCycle.MONTHLY) result.setUTCMonth(result.getUTCMonth() + 1)
    else if (cycle === PlanBillingCycle.YEARLY) result.setUTCFullYear(result.getUTCFullYear() + 1)
    else result.setUTCFullYear(result.getUTCFullYear() + 100)
    return result
  }

  private renewalReminderAt(periodEnd: Date) {
    return new Date(Math.max(Date.now(), periodEnd.getTime() - 3 * 86_400_000))
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
