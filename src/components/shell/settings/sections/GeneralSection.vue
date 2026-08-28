<template>
  <h2 id="settings-general">{{ t('settings.general') }}</h2>
  <label class="settings-option-row"><span><strong>{{ t('settings.appearance') }}</strong><small>选择 Xinyue AI 的界面显示方式。</small></span><select v-model="settings.appearance" aria-label="外观"><option value="深色">{{ t('settings.dark') }}</option><option value="浅色">{{ t('settings.light') }}</option><option value="跟随系统">{{ t('settings.system') }}</option></select></label>
  <label class="settings-option-row"><span><strong>{{ t('settings.language') }}</strong><small>设置界面语言。</small></span><select v-model="settings.language" aria-label="语言"><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option></select></label>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { WorkspaceSettings } from '../../types'

defineProps<{
  settings: WorkspaceSettings
}>()

const { t } = useI18n()
</script>
