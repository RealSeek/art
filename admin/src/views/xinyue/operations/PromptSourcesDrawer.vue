<template>
  <ElDrawer
    :model-value="modelValue"
    :title="xt('提示词库来源')"
    size="min(960px, 96vw)"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert
      class="source-cache-notice"
      type="info"
      :closable="false"
      :title="xt('图片与视频提示词均从本地缓存读取，系统每 6 小时自动检查更新，也可单独手动刷新。')"
    />
    <ElTable v-loading="loading" :data="sources" row-key="id">
      <ElTableColumn :label="xt('类型')" prop="promptTypeLabel" width="72" />
      <ElTableColumn :label="xt('来源')" min-width="180">
        <template #default="{ row }">
          <ElInput v-model.trim="row.displayName" maxlength="100" />
          <small class="source-meta">{{ row.upstreamName || row.id }}</small>
        </template>
      </ElTableColumn>
      <ElTableColumn :label="xt('内容数')" prop="count" width="90" />
      <ElTableColumn :label="xt('排序')" width="120">
        <template #default="{ row }"
          ><ElInputNumber v-model="row.sortOrder" :min="0" :max="100000" controls-position="right"
        /></template>
      </ElTableColumn>
      <ElTableColumn :label="xt('启用')" width="90">
        <template #default="{ row }"><ElSwitch v-model="row.enabled" /></template>
      </ElTableColumn>
      <ElTableColumn :label="xt('缓存状态')" min-width="180">
        <template #default="{ row }">
          <ElTag :type="row.refreshing ? 'warning' : row.lastError ? 'danger' : 'success'">
            {{ row.refreshing ? xt('同步中') : row.lastError ? xt('同步异常') : xt('缓存完整') }}
          </ElTag>
          <small v-if="row.fetchedAt" class="source-meta"
            >{{ xt('更新于') }} {{ formatDate(row.fetchedAt) }}</small
          >
          <small v-if="row.lastError && !row.refreshing" class="source-error">{{
            row.lastError
          }}</small>
        </template>
      </ElTableColumn>
      <ElTableColumn :label="xt('操作')" width="138" align="right">
        <template #default="{ row }">
          <ElButton link :loading="row._refreshing" @click="emit('refresh', row)">{{
            xt('更新缓存')
          }}</ElButton>
          <ElButton link type="primary" @click="emit('save', row)">{{ xt('保存') }}</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { xinyueText as xt } from '@/locales/xinyue'
  import type { ResourceRow as Row } from './resource-types'

  defineProps<{
    modelValue: boolean
    loading: boolean
    sources: Row[]
    formatDate: (value: unknown) => string
  }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    save: [row: Row]
    refresh: [row: Row]
  }>()
</script>

<style scoped>
  .source-cache-notice {
    margin-bottom: 16px;
  }
  .source-meta,
  .source-error {
    display: block;
    font-size: 12px;
    line-height: 1.5;
    color: var(--art-gray-500);
  }
  .source-meta {
    margin-top: 5px;
  }
  .source-error {
    margin-top: 4px;
    color: var(--el-color-danger);
  }
</style>
