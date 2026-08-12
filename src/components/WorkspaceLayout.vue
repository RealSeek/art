<template>
  <WorkspaceShell :active-mode="activeMode">
    <RouterView />
  </WorkspaceShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import WorkspaceShell from './WorkspaceShell.vue'
import type { StudioMode } from '../types'

const route = useRoute()
const activeMode = computed<StudioMode>(() => {
  const modes: Record<string, StudioMode> = {
    chat: 'chat',
    images: 'images',
    videos: 'videos',
    commerce: 'commerce',
    prompts: 'prompts',
    projects: 'projects',
    assets: 'assets',
  }
  return modes[String(route.name)] || 'api'
})
</script>
