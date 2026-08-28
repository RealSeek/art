<template>
  <h2 id="settings-invite">邀请与奖励</h2><section class="settings-invite-grid"><div><span>已邀请用户</span><strong>{{ inviteInfo.invited }}</strong><small>通过你的邀请链接注册的用户数量。</small></div><div><span>累计奖励</span><strong>{{ inviteInfo.reward }} 创作点</strong><small>已完成冷静期并计入账户的奖励。</small></div><div><span>待发放</span><strong>{{ inviteInfo.pending }}</strong><small>正在冷静期或已审核通过的邀请。</small></div><div><span>审核中</span><strong>{{ inviteInfo.reviewRequired }}</strong><small>需要管理员核验的邀请记录。</small></div></section><label class="invite-link"><span>邀请链接</span><div><input readonly :value="inviteInfo.url" /><button type="button" :disabled="!inviteInfo.url" @click="copyInvite">{{ inviteCopied ? '已复制' : '复制' }}</button></div></label><section class="settings-empty-section"><h3>邀请码</h3><p>{{ inviteInfo.code || '登录后生成专属邀请码' }}</p></section>
</template>

<script setup lang="ts">
import type { InviteInfo } from '../../types'

defineProps<{
  inviteInfo: InviteInfo
  inviteCopied: boolean
  copyInvite: () => void
}>()
</script>
