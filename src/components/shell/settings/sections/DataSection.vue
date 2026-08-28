<template>
  <h2 id="settings-data">数据控制</h2>
  <section class="settings-data-section">
    <div class="settings-action-row"><span><strong>导出账户数据</strong><small>下载账户资料、设置、项目、文件索引和全部聊天记录的 JSON 副本。</small></span><button type="button" :disabled="dataActionBusy" @click="exportAccountData"><Download :size="15" />导出</button></div>
    <div class="settings-action-row"><span><strong>删除全部聊天</strong><small>永久删除所有聊天和消息。项目与已生成文件不会被删除。</small></span><button class="danger-button" type="button" :disabled="dataActionBusy || !studio.conversations.length" @click="clearConversationHistory"><Trash2 :size="15" />全部删除</button></div>
    <small v-if="dataActionMessage" class="settings-feedback" :class="{ 'is-error': dataActionError }">{{ dataActionMessage }}</small>
  </section>
  <section class="settings-memory"><h3>隐私</h3><div><span><strong>保存聊天记录</strong><small>关闭后新聊天会自动作为临时聊天处理。</small></span><button class="switch-control" :class="{ 'is-on': settings.chatHistoryEnabled }" type="button" role="switch" :aria-checked="settings.chatHistoryEnabled" @click="settings.chatHistoryEnabled = !settings.chatHistoryEnabled"><i /></button></div><div><span><strong>不将内容用于模型训练</strong><small>管理员渠道会收到该隐私偏好，用于后续上游策略适配。</small></span><button class="switch-control" :class="{ 'is-on': settings.trainingOptOut }" type="button" role="switch" :aria-checked="settings.trainingOptOut" @click="settings.trainingOptOut = !settings.trainingOptOut"><i /></button></div><div><span><strong>默认使用临时聊天</strong><small>新聊天不显示在历史记录中并自动过期。</small></span><button class="switch-control" :class="{ 'is-on': settings.temporaryChatDefault }" type="button" role="switch" :aria-checked="settings.temporaryChatDefault" @click="settings.temporaryChatDefault = !settings.temporaryChatDefault"><i /></button></div><div><span><strong>共享匿名使用分析</strong><small>仅用于产品稳定性和功能使用统计。</small></span><button class="switch-control" :class="{ 'is-on': settings.shareUsageAnalytics }" type="button" role="switch" :aria-checked="settings.shareUsageAnalytics" @click="settings.shareUsageAnalytics = !settings.shareUsageAnalytics"><i /></button></div><label class="settings-option-row"><span><strong>聊天数据保留</strong><small>超过期限的普通聊天会自动永久删除。</small></span><select v-model.number="settings.dataRetentionDays"><option :value="0">永久保留</option><option :value="30">30 天</option><option :value="90">90 天</option><option :value="365">1 年</option></select></label></section>
  <section class="settings-moderation-cases">
    <header><div><h3>内容审核与申诉</h3><p>查看被安全策略拦截的内容。认为判断有误时，可提交一次人工复核。</p></div><span>{{ moderationCases.length }} 条记录</span></header>
    <article v-for="item in moderationCases" :key="item.id">
      <div class="moderation-case-heading"><span><strong>{{ moderationSourceText[item.source] || item.source }}</strong><small>{{ formatServerDate(item.createdAt) }}</small></span><em :class="`status-${(item.appeal?.status || item.status).toLowerCase()}`">{{ moderationCaseStatus(item) }}</em></div>
      <p>{{ item.contentExcerpt }}</p>
      <template v-if="!item.appeal && item.status === 'OPEN'">
        <textarea v-model.trim="appealDrafts[item.id]" maxlength="1000" placeholder="说明内容用途、上下文和申请复核的理由（至少 10 个字）" />
        <footer><small>{{ (appealDrafts[item.id] || '').length }}/1000</small><button type="button" :disabled="appealBusyId === item.id || (appealDrafts[item.id] || '').trim().length < 10" @click="submitModerationAppeal(item)">{{ appealBusyId === item.id ? '提交中' : '提交申诉' }}</button></footer>
      </template>
      <template v-else-if="item.appeal">
        <div class="moderation-appeal-copy"><strong>申诉理由</strong><p>{{ item.appeal.reason }}</p><template v-if="item.appeal.reviewNote"><strong>复核说明</strong><p>{{ item.appeal.reviewNote }}</p></template></div>
        <footer v-if="item.appeal.status === 'PENDING'"><small>管理员开始复核前可以撤回。</small><button class="danger-button" type="button" :disabled="appealBusyId === item.id" @click="cancelModerationAppeal(item)">撤回申诉</button></footer>
      </template>
    </article>
    <p v-if="!moderationCases.length" class="settings-empty-copy">当前账户没有内容审核记录。</p>
    <small v-if="appealMessage" class="settings-feedback" :class="{ 'is-error': appealError }">{{ appealMessage }}</small>
  </section>
  <section class="settings-empty-section"><h3>共享链接</h3><p>管理你主动公开的对话副本。删除后，原链接会立即失效。</p><strong>你还没有创建公开对话链接。</strong></section>
</template>

<script setup lang="ts">
import { Download, Trash2 } from 'lucide-vue-next'
import { useStudioStore } from '../../../../stores/studio'
import { formatServerDate } from '../../format'
import { moderationSourceText } from '../../labels'
import type { ModerationCase, WorkspaceSettings } from '../../types'

defineProps<{
  settings: WorkspaceSettings
  dataActionBusy: boolean
  dataActionMessage: string
  dataActionError: boolean
  moderationCases: ModerationCase[]
  appealDrafts: Record<string, string>
  appealBusyId: string
  appealMessage: string
  appealError: boolean
  exportAccountData: () => Promise<void>
  clearConversationHistory: () => Promise<void>
  submitModerationAppeal: (item: ModerationCase) => Promise<void>
  cancelModerationAppeal: (item: ModerationCase) => Promise<void>
}>()

const studio = useStudioStore()

function moderationCaseStatus(item: ModerationCase) {
  const status = item.appeal?.status
  if (status === 'PENDING') return '申诉待处理'
  if (status === 'IN_REVIEW') return '申诉复核中'
  if (status === 'APPROVED') return '申诉已通过'
  if (status === 'REJECTED') return '申诉未通过'
  if (status === 'CANCELLED') return '申诉已撤回'
  return item.status === 'APPROVED' ? '审核已通过' : item.status === 'DISMISSED' ? '审核已驳回' : '已拦截'
}
</script>
