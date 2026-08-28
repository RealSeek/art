<template>
  <h2 id="settings-credits">创作点</h2><section class="settings-credit-card"><p>创作点余额</p><small>所有图片和商品视觉创作统一从当前余额扣点。</small><strong>{{ studio.credits }} 创作点</strong></section><template v-if="publicSettings.rechargeEnabled"><div class="settings-action-row"><span><strong>充值套餐</strong><small>创建订单后按页面提示完成付款</small></span></div><section class="settings-recharge-grid"><button v-for="item in rechargePackages" :key="item.id" type="button" :disabled="creatingOrder" @click="createRechargeOrder(item)"><span><strong>{{ item.name }}</strong><small>{{ item.credits }} 创作点</small></span><b>{{ formatMoney(item.priceCents) }}</b><em v-if="item.recommended">推荐</em></button></section><small v-if="rechargeMessage" class="settings-feedback">{{ rechargeMessage }}</small><section v-if="rechargeOrders.length" class="settings-history"><h3>充值订单</h3><div v-for="order in rechargeOrders" :key="order.id"><span>{{ order.package?.name || '充值订单' }}<small>{{ formatServerDate(order.createdAt) }} · {{ rechargeStatusText[order.status] || order.status }}</small></span><strong>{{ formatMoney(order.amountCents) }}</strong></div></section></template><div v-else class="settings-action-row"><span><strong>补充方式</strong><small>当前可使用兑换码，充值入口由管理员控制</small></span></div><section class="settings-history"><h3>创作点记录</h3><div v-for="entry in creditLedger" :key="entry.id"><span>{{ entry.description }}<small>{{ formatServerDate(entry.createdAt) }}</small></span><strong :class="{ 'is-negative': entry.amount < 0 }">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }} 点</strong></div><p v-if="!creditLedger.length">暂无创作点记录</p></section>
</template>

<script setup lang="ts">
import { useStudioStore } from '../../../../stores/studio'
import { formatServerDate } from '../../format'
import { rechargeStatusText } from '../../labels'
import type { CreditEntry, PublicSettings, RechargeOrder, RechargePackage } from '../../types'

defineProps<{
  publicSettings: PublicSettings
  rechargePackages: RechargePackage[]
  creatingOrder: boolean
  rechargeMessage: string
  rechargeOrders: RechargeOrder[]
  creditLedger: CreditEntry[]
  createRechargeOrder: (item: RechargePackage) => Promise<void>
  formatMoney: (cents: number) => string
}>()

const studio = useStudioStore()
</script>
