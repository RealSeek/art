<template>
  <ElDrawer
    :model-value="modelValue"
    :title="`${xt(title)}${xt('详情')}`"
    size="520px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElDescriptions v-if="row" :column="1" border>
      <ElDescriptionsItem v-for="item in items" :key="item.key" :label="item.label">
        <pre v-if="item.complex">{{ item.value }}</pre>
        <span v-else>{{ item.value }}</span>
      </ElDescriptionsItem>
    </ElDescriptions>
    <template v-if="resourceKey === 'knowledgeBases' && row">
      <ElDivider content-position="left">{{ xt('绑定文档') }}</ElDivider>
      <ElTable v-if="row.assets?.length" :data="row.assets" size="small" row-key="assetId">
        <ElTableColumn :label="xt('文件名')" min-width="190">
          <template #default="{ row: assetRow }">{{
            assetRow.asset?.name || assetRow.assetId
          }}</template>
        </ElTableColumn>
        <ElTableColumn :label="xt('类型')" min-width="130">
          <template #default="{ row: assetRow }">{{ assetRow.asset?.mimeType || '-' }}</template>
        </ElTableColumn>
        <ElTableColumn :label="xt('分块')" width="80" prop="chunkCount" />
        <ElTableColumn :label="xt('状态')" width="90">
          <template #default="{ row: assetRow }">
            <ElTag :type="statusType(assetRow.status)">{{ statusText(assetRow.status) }}</ElTag>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-else :description="xt('尚未绑定文档')" :image-size="64" />
      <ElDivider content-position="left">{{ xt('关联助手') }}</ElDivider>
      <div v-if="row.assistants?.length" class="knowledge-assistant-list">
        <ElTag v-for="item in row.assistants" :key="item.assistantId" effect="plain">
          {{ item.assistant?.name || item.assistantId }}
        </ElTag>
      </div>
      <ElEmpty v-else :description="xt('尚未关联助手')" :image-size="64" />
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { xinyueText as xt } from '@/locales/xinyue'
  import type { ResourceRow as Row } from './resource-types'

  defineProps<{
    modelValue: boolean
    title: string
    resourceKey: string
    row: Row | null
    items: Array<{ key: string; label: string; complex: boolean; value: string }>
    statusText: (value: unknown) => string
    statusType: (value: unknown) => any
  }>()

  const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<style scoped>
  .knowledge-assistant-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  pre {
    max-width: 100%;
    margin: 0;
    overflow: auto;
    font:
      12px/1.6 Consolas,
      monospace;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
