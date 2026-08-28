<template>
        <div v-if="!hasChatThread" class="chat-home-identity" :class="{ 'is-temporary': store.temporaryChat }">
          <span v-if="chatUiPreset === 'kimi'" class="chat-home-wordmark">XINYUE</span>
          <h2 v-if="chatHomeTitle"><Sparkles v-if="chatUiPreset === 'qianwen' && !store.temporaryChat" class="chat-home-qianwen-mark" :size="30" fill="currentColor" />{{ chatHomeTitle }}</h2>
          <h2 v-else-if="store.temporaryChat">临时聊天</h2>
          <p v-if="chatHomeSubtitle">{{ chatHomeSubtitle }}</p>
        </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import { useCatalogStore, type ChatUiPreset } from '../../stores/catalog'
import { useStudioStore } from '../../stores/studio'

defineProps<{ hasChatThread: boolean }>()

const store = useStudioStore()
const catalog = useCatalogStore()
const chatUiPreset = computed<ChatUiPreset>(() => catalog.settings.chatUiPreset || 'gpt')
const chatHomeTitle = computed(() => store.temporaryChat && chatUiPreset.value !== 'kimi' ? '临时聊天' : ({ gpt: '我们先从哪里开始呢？', doubao: '有什么我能帮你的吗？', qianwen: '你好，我是 Xinyue AI', kimi: '' })[chatUiPreset.value])
const chatHomeSubtitle = computed(() => store.temporaryChat && chatUiPreset.value !== 'kimi' ? '这次聊天不会出现在历史记录中，也不会用于改进模型。' : '')
</script>
