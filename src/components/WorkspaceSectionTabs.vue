<template>
  <nav class="workspace-section-tabs" aria-label="工作空间内容">
    <RouterLink :to="{ path: '/workspace', query: { tab: 'projects' } }" :class="{ 'is-active': active === 'projects' }">
      <FolderKanban :size="17" />
      <span>项目</span>
    </RouterLink>
    <RouterLink :to="{ path: '/workspace', query: { tab: 'files' } }" :class="{ 'is-active': active === 'files' }">
      <Files :size="17" />
      <span>文件</span>
    </RouterLink>
    <RouterLink to="/canvases" :class="{ 'is-active': active === 'canvases' }">
      <Spline :size="17" />
      <span>画布</span>
    </RouterLink>
    <RouterLink to="/works" :class="{ 'is-active': active === 'works' }">
      <Images :size="17" />
      <span>作品</span>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { Files, FolderKanban, Images, Spline } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'

defineProps<{ active: 'projects' | 'files' | 'canvases' | 'works' }>()
</script>

<style scoped>
.workspace-section-tabs {
  align-items: center;
  background: var(--studio-control);
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  display: inline-flex;
  gap: 3px;
  margin-bottom: 30px;
  padding: 3px;
}

.workspace-section-tabs a {
  align-items: center;
  border-radius: 6px;
  color: var(--studio-muted);
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 7px;
  height: 36px;
  justify-content: center;
  min-width: 104px;
  padding: 0 16px;
  text-decoration: none;
}

.workspace-section-tabs a:hover {
  color: var(--studio-text);
}

.workspace-section-tabs a.is-active {
  background: var(--studio-elevated);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .18);
  color: var(--studio-text);
}

@media (max-width: 640px) {
  .workspace-section-tabs {
    display: flex;
    margin-bottom: 24px;
    width: 100%;
  }

  .workspace-section-tabs a {
    flex: 1;
    min-width: 0;
  }
}
</style>
