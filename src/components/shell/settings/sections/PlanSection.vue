<template>
  <h2 id="settings-plan">套餐与账单</h2>
  <section v-if="currentSubscription" class="settings-current-plan"><div><span>{{ currentSubscription.status === 'TRIALING' ? '试用中' : '当前套餐' }}</span><h3>{{ currentSubscription.plan.name }}</h3><p>{{ subscriptionEndText }}</p></div><strong>{{ currentSubscription.plan.includedCredits }}<small>创作点 / 周期</small></strong></section>
  <section class="settings-token-quota"><header><div><h3>Token 与计费额度</h3><p>对话展示实际 Token 用量，额度会按模型的输入/输出价格折算；图片、视频和商品视觉仍使用创作点。</p></div><span v-if="tokenQuotaLoading">加载中</span></header><div v-if="tokenQuotaRows.length" class="settings-token-quota-list"><article v-for="quota in tokenQuotaRows" :key="quota.quotaId || quota.scopeKey || 'quota'"><div><strong>{{ quota.isDaily ? '今日额度' : '本周期额度' }}</strong><small>{{ quota.periodEnd ? `${quota.periodEnd} 前有效` : '当前有效额度' }}</small></div><dl><div><dt>剩余计费额度</dt><dd>{{ formatUnits(quota.remainingUnits) }}</dd></div><div><dt>已用计费额度</dt><dd>{{ formatUnits(quota.usedUnits) }}</dd></div><div><dt>预留计费额度</dt><dd>{{ formatUnits(quota.reservedUnits) }}</dd></div><div><dt>计费额度总额</dt><dd>{{ formatUnits(quota.grantedUnits) }}</dd></div></dl><div class="settings-token-usage-inline"><span>输入 Token <strong>{{ formatUnits(quota.inputTokens) }}</strong></span><span>输出 Token <strong>{{ formatUnits(quota.outputTokens) }}</strong></span><span v-if="hasUsage(quota.cachedInputTokens)">缓存 Token <strong>{{ formatUnits(quota.cachedInputTokens) }}</strong></span><span v-if="hasUsage(quota.reasoningTokens)">推理 Token <strong>{{ formatUnits(quota.reasoningTokens) }}</strong></span></div></article></div><p v-else-if="!tokenQuotaLoading" class="settings-token-quota-empty">暂未分配计费额度，升级套餐后即可使用。</p></section>
  <div v-if="currentSubscription && !currentSubscription.cancelAtPeriodEnd" class="settings-action-row"><span><strong>取消自动续订</strong><small>付费套餐将在当前周期结束后停止，试用套餐会立即结束。</small></span><button type="button" :disabled="planBusy" @click="cancelSubscription">取消套餐</button></div><section v-if="!currentSubscription" class="settings-empty-section"><h3>免费版</h3><p>升级套餐可获得周期额度、更高并发和更多创作能力。</p><button v-if="publicSettings.trialEnabled" type="button" :disabled="planBusy" @click="startTrial()">{{ planBusy ? '处理中' : '开始免费试用' }}</button></section>
  <section class="settings-plan-grid"><article v-for="plan in subscriptionPlans" :key="plan.id" :class="{ recommended: plan.recommended }"><header><strong>{{ plan.name }}</strong><em v-if="plan.promotion">{{ plan.promotion.label || '限时优惠' }}</em><em v-else-if="plan.recommended">推荐</em></header><h3><del v-if="plan.effectivePriceCents !== undefined && plan.effectivePriceCents < plan.priceCents">{{ formatMoney(plan.priceCents) }}</del>{{ formatMoney(plan.effectivePriceCents ?? plan.priceCents) }}<small>/ {{ plan.billingCycle === 'YEARLY' ? '年' : plan.billingCycle === 'ONE_TIME' ? '一次性' : '月' }}</small></h3><p>{{ plan.description }}</p><ul><li v-if="plan.promotion">{{ plan.promotion.name }} · {{ formatServerDate(plan.promotion.endsAt) }}结束</li><li>{{ plan.includedCredits }} 创作点</li><li>{{ plan.concurrency }} 路并发</li><li>{{ [plan.imageAccess && '图片', plan.videoAccess && '视频', plan.commerceAccess && '商品视觉'].filter(Boolean).join('、') || '对话' }}能力</li><li>{{ plan.allowByok ? '支持个人 API 密钥' : '管理员统一渠道' }}</li><li v-if="plan.trialDays">{{ plan.trialDays }} 天免费试用</li></ul><button type="button" :disabled="planBusy || currentSubscription?.planId === plan.id || (!currentSubscription && !plan.priceCents && !plan.trialDays) || (plan.priceCents > 0 && !publicSettings.subscriptionsEnabled)" @click="purchasePlan(plan)">{{ currentSubscription?.planId === plan.id ? '当前套餐' : !plan.priceCents && !plan.trialDays ? '当前免费方案' : plan.priceCents && !publicSettings.subscriptionsEnabled ? '暂未开放' : plan.priceCents ? '选择套餐' : '免费试用' }}</button></article></section>
  <section v-if="couponWallet.templates.length || couponWallet.coupons.length" class="settings-coupon-wallet"><header><div><h3>我的优惠券</h3><p>结算时可选择适用优惠券，系统会按活动叠加规则重新报价。</p></div><span>{{ couponWallet.coupons.filter((item) => item.status === 'AVAILABLE').length }} 张可用</span></header><div class="settings-coupon-list"><article v-for="coupon in couponWallet.coupons" :key="coupon.id" :class="`status-${coupon.status.toLowerCase()}`"><strong>{{ coupon.template.name }}</strong><span>{{ coupon.template.discountType === 'FIXED' ? `立减 ${formatMoney(coupon.template.discountValue)}` : `优惠 ${coupon.template.discountValue / 100}%` }}</span><small>{{ coupon.status === 'AVAILABLE' ? `${coupon.expiresAt ? formatServerDate(coupon.expiresAt) : '长期'}前可用` : coupon.status === 'LOCKED' ? '订单占用中' : coupon.status === 'REDEEMED' ? '已使用' : '已失效' }}</small></article><button v-for="template in couponWallet.templates" :key="template.id" type="button" :disabled="couponBusyId === template.id" @click="claimCoupon(template)"><strong>{{ template.name }}</strong><span>{{ template.discountType === 'FIXED' ? `立减 ${formatMoney(template.discountValue)}` : `优惠 ${template.discountValue / 100}%` }}</span><small>{{ couponBusyId === template.id ? '领取中' : '立即领取' }}</small></button></div></section>
  <small v-if="planMessage" class="settings-feedback" :class="{ 'is-error': planError }">{{ planMessage }}</small><section v-if="subscriptionOrders.length" class="settings-history"><h3>套餐订单</h3><div v-for="order in subscriptionOrders" :key="order.id"><span>{{ order.plan.name }}<small>{{ formatServerDate(order.createdAt) }} · {{ rechargeStatusText[order.status] || order.status }}</small></span><strong><template v-if="order.status === 'PENDING'"><button type="button" @click="continueSubscriptionPayment(order)">继续支付</button><button type="button" class="danger-button" @click="cancelPendingSubscriptionOrder(order)">取消</button></template><template v-else>{{ formatMoney(order.amountCents) }}</template></strong></div></section>
  <section v-if="currentSubscription && currentSubscription.plan.priceCents > 0 && currentSubscription.plan.billingCycle !== 'ONE_TIME'" class="settings-billing-section"><header><div><h3>续费设置</h3><p>到期前 3 天自动创建续费订单并通知；支付完成后延长当前周期，不会在没有支付授权时自动扣款。</p></div></header><label class="settings-option-row"><span><strong>到期续费提醒</strong><small>{{ currentSubscription.autoRenewEnabled ? '已启用' : '未启用' }}</small></span><button class="switch-control" :class="{ 'is-on': currentSubscription.autoRenewEnabled }" type="button" role="switch" :aria-checked="currentSubscription.autoRenewEnabled" :disabled="planBusy" @click="toggleRenewal"><i /></button></label><label v-if="renewalOptions?.channels.length" class="settings-option-row"><span><strong>续费支付渠道</strong><small>订单创建后仍需由你确认付款。</small></span><select v-model="selectedRenewalChannelId" :disabled="!currentSubscription.autoRenewEnabled" @change="saveRenewalChannel"><option v-for="channel in renewalOptions.channels" :key="channel.id" :value="channel.id">{{ channel.name }}</option></select></label><section v-if="renewalAttempts.length" class="settings-history compact"><h3>续费记录</h3><div v-for="item in renewalAttempts.slice(0, 5)" :key="item.id"><span>第 {{ item.attemptNumber }} 次续费<small>{{ formatServerDate(item.createdAt) }} · {{ renewalAttemptText[item.status] || item.status }}</small></span><strong>{{ item.failureReason || (item.orderId ? '订单已创建' : '') }}</strong></div></section></section>
  <section class="settings-billing-section"><header><div><h3>开票资料</h3><p>企业发票需要完整纳税人信息。发票申请会保存当时的资料快照。</p></div></header><div class="settings-billing-form"><label>抬头类型<select v-model="billingProfile.profileType"><option value="COMPANY">企业</option><option value="PERSONAL">个人</option></select></label><label>发票抬头<input v-model.trim="billingProfile.title" maxlength="200" /></label><label v-if="billingProfile.profileType === 'COMPANY'">纳税人识别号<input v-model.trim="billingProfile.taxId" maxlength="100" /></label><label>接收邮箱<input v-model.trim="billingProfile.invoiceEmail" type="email" maxlength="320" /></label><label>联系电话<input v-model.trim="billingProfile.phone" maxlength="50" /></label><label class="wide">注册地址<input v-model.trim="billingProfile.address" maxlength="1000" /></label><label>开户银行<input v-model.trim="billingProfile.bankName" maxlength="200" /></label><label>银行账号<input v-model.trim="billingProfile.bankAccount" maxlength="200" /></label></div><button class="settings-primary-action" type="button" :disabled="billingBusy" @click="saveBillingProfile">保存开票资料</button><div v-if="invoiceTransactions.length" class="settings-invoice-request"><select v-model="selectedInvoiceTransactionId"><option value="">选择可开票交易</option><option v-for="item in invoiceTransactions" :key="item.id" :value="item.id">{{ item.outTradeNo }} · {{ formatMoney(item.amountCents) }}</option></select><button type="button" :disabled="billingBusy || !selectedInvoiceTransactionId" @click="requestInvoice">申请电子发票</button></div><section v-if="invoiceRequests.length" class="settings-history compact"><h3>发票记录</h3><div v-for="item in invoiceRequests" :key="item.id"><span>{{ item.transaction.outTradeNo }}<small>{{ formatServerDate(item.requestedAt) }} · {{ invoiceStatusText[item.status] || item.status }}</small></span><strong><a v-if="item.status === 'ISSUED' && item.invoiceUrl" :href="item.invoiceUrl" target="_blank" rel="noopener">下载发票</a><button v-else-if="['REQUESTED','REVIEWING'].includes(item.status)" type="button" @click="cancelInvoiceRequest(item)">撤销</button><template v-else>{{ item.rejectionReason }}</template></strong></div></section><small v-if="billingMessage" class="settings-feedback">{{ billingMessage }}</small></section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatServerDate } from '../../format'
import { invoiceStatusText, rechargeStatusText, renewalAttemptText } from '../../labels'
import type {
  BillingProfile,
  CouponTemplate,
  CouponWallet,
  InvoiceRequest,
  InvoiceTransaction,
  PublicSettings,
  RenewalAttempt,
  RenewalOptions,
  Subscription,
  SubscriptionOrder,
  SubscriptionPlan,
  TokenQuotaSummary,
} from '../../types'

const props = defineProps<{
  currentSubscription: Subscription | null
  subscriptionPlans: SubscriptionPlan[]
  planBusy: boolean
  planMessage: string
  planError: boolean
  publicSettings: PublicSettings
  couponWallet: CouponWallet
  couponBusyId: string
  subscriptionOrders: SubscriptionOrder[]
  renewalOptions: RenewalOptions | null
  renewalAttempts: RenewalAttempt[]
  billingProfile: BillingProfile
  billingBusy: boolean
  billingMessage: string
  invoiceTransactions: InvoiceTransaction[]
  invoiceRequests: InvoiceRequest[]
  tokenQuota: TokenQuotaSummary[]
  tokenQuotaLoading: boolean
  formatMoney: (cents: number) => string
  cancelSubscription: () => Promise<void>
  startTrial: (planId?: string) => Promise<void>
  purchasePlan: (plan: SubscriptionPlan) => Promise<void>
  claimCoupon: (template: CouponTemplate) => Promise<void>
  continueSubscriptionPayment: (order: SubscriptionOrder) => Promise<void>
  cancelPendingSubscriptionOrder: (order: SubscriptionOrder) => Promise<void>
  toggleRenewal: () => Promise<void>
  saveRenewalChannel: () => Promise<void>
  saveBillingProfile: () => Promise<void>
  requestInvoice: () => Promise<void>
  cancelInvoiceRequest: (item: InvoiceRequest) => Promise<void>
}>()

const selectedRenewalChannelId = defineModel<string>('selectedRenewalChannelId', { required: true })
const selectedInvoiceTransactionId = defineModel<string>('selectedInvoiceTransactionId', { required: true })

const tokenQuotaRows = computed(() => props.tokenQuota
  .map((quota) => ({
    ...quota,
    isDaily: quota.scopeKey?.startsWith('DAILY:') === true,
    periodEnd: quota.periodEnd ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(quota.periodEnd)) : null,
  }))
  .sort((a, b) => Number(a.isDaily) - Number(b.isDaily)))

function formatUnits(value: string) {
  try {
    const units = BigInt(value || '0')
    const absolute = units < 0n ? -units : units
    const sign = units < 0n ? '-' : ''
    const compact = (divisor: bigint, suffix: string) => {
      const whole = absolute / divisor
      const decimal = (absolute % divisor) * 10n / divisor
      return `${sign}${whole.toString()}${decimal ? `.${decimal.toString()}` : ''} ${suffix}`
    }
    if (absolute >= 100000000n) return compact(100000000n, '亿')
    if (absolute >= 10000n) return compact(10000n, '万')
    return `${sign}${absolute.toString()}`
  } catch {
    return '0'
  }
}

function hasUsage(value: string) {
  try {
    return BigInt(value || '0') > 0n
  } catch {
    return false
  }
}

const subscriptionEndText = computed(() => {
  const subscription = props.currentSubscription
  if (!subscription?.currentPeriodEnd) return '长期有效'
  const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(subscription.currentPeriodEnd))
  if (subscription.status === 'TRIALING') return `试用至 ${date}`
  return subscription.cancelAtPeriodEnd ? `${date} 到期后停止` : `下一周期：${date}`
})
</script>
