<template>
  <h2 id="settings-redeem">兑换码</h2><section class="settings-empty-section"><h3>兑换创作点</h3><p>输入有效兑换码，将创作点添加到当前账户。</p><label class="redeem-field">兑换码<input v-model="settings.redeemCode" placeholder="请输入兑换码" @keydown.enter.prevent="redeemCredits" /></label><button type="button" :disabled="!settings.redeemCode.trim() || redeeming" @click="redeemCredits">{{ redeeming ? '兑换中' : '兑换' }}</button><small v-if="redeemMessage" class="settings-feedback" :class="{ 'is-error': redeemError }">{{ redeemMessage }}</small></section>
</template>

<script setup lang="ts">
import type { WorkspaceSettings } from '../../types'

defineProps<{
  settings: WorkspaceSettings
  redeeming: boolean
  redeemMessage: string
  redeemError: boolean
  redeemCredits: () => Promise<void>
}>()
</script>
