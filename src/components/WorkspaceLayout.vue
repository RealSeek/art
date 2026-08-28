<template>
  <WorkspaceShell :active-mode="activeMode" :canvas-route="canvasRoute">
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
    office: 'office',
    prompts: 'prompts',
    plugins: 'plugins',
    capabilities: 'plugins',
    workspace: 'workspace',
    canvases: 'workspace',
    'image-prompt': 'workspace',
    canvas: 'workspace',
  }
  return modes[String(route.name)] || 'api'
})
const canvasRoute = computed(() => route.name === 'canvas')
</script>
