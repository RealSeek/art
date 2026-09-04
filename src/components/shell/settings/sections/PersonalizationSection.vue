<template>
  <h2 id="settings-personalization">{{ t('settings.personalization') }}</h2>
  <label class="settings-option-row"><span><strong>基本风格和语调</strong><small>设置 OnlyArt 回复你的风格和语调，不会改变功能或执行权限。</small></span><select v-model="settings.style" aria-label="基本风格和语调"><option>默认</option><option>专业</option><option>友好</option><option>直率</option></select></label>
  <label class="settings-option-row"><span><strong>回答详略</strong><small>选择默认的信息密度，本轮明确要求始终优先。</small></span><select v-model="settings.detail" aria-label="回答详略"><option>自动判断</option><option>简洁</option><option>详细</option></select></label>
  <label class="settings-option-row"><span><strong>回复语言</strong><small>设置默认回复语言，也可以继续跟随当前对话。</small></span><select v-model="settings.replyLanguage" aria-label="回复语言"><option>跟随对话</option><option>中文</option><option>English</option></select></label>
  <label class="settings-textarea"><strong>自定义指令</strong><textarea v-model="settings.customInstructions" maxlength="1000" placeholder="例如：先给结论，再说明关键依据；涉及代码时优先给出可执行方案。" /><small>{{ settings.customInstructions.length }}/1000</small></label>
  <section class="settings-about"><h3>关于你</h3><p>这些资料会持续用于个性化回复。请勿填写密码、API 密钥或证件号。</p><label>昵称<input v-model="settings.nickname" placeholder="OnlyArt 应该怎么称呼你？" /></label><label>职业<input v-model="settings.occupation" placeholder="例如：独立开发者" /></label><label>你的详情<textarea v-model="settings.bio" maxlength="1000" placeholder="需要持续考虑的兴趣、目标、工作方式或背景" /></label><button type="button" @click="saveSettings(true)">保存</button><small v-if="settingsMessage" class="settings-feedback">{{ settingsMessage }}</small></section>
  <section class="settings-memory"><h3>记忆</h3><div><span><strong>使用已保存的记忆</strong><small>让 OnlyArt 保存并使用你确认过的称呼、习惯和稳定偏好。</small></span><button class="switch-control" :class="{ 'is-on': settings.useMemory }" type="button" role="switch" :aria-checked="settings.useMemory" @click="settings.useMemory = !settings.useMemory"><i /></button></div><div><span><strong>参考过往聊天</strong><small>允许普通聊天在相关时参考其他会话的话题摘要。</small></span><button class="switch-control" :class="{ 'is-on': settings.referenceChats }" type="button" role="switch" :aria-checked="settings.referenceChats" @click="settings.referenceChats = !settings.referenceChats"><i /></button></div></section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { WorkspaceSettings } from '../../types'

defineProps<{
  settings: WorkspaceSettings
  settingsMessage: string
  saveSettings: (showFeedback?: boolean) => Promise<void>
}>()

const { t } = useI18n()
</script>
