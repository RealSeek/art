<template>
  <ElDrawer
    :model-value="modelValue"
    :title="xt('项目工作流与版本')"
    size="760px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="detail">
      <div class="project-audit-head">
        <div
          ><strong>{{ detail.name }}</strong
          ><p>{{ detail.user?.displayName }} · {{ detail.user?.email }}</p></div
        >
        <ElTag :type="statusType(detail.workflowStatus)">{{
          statusText(detail.workflowStatus)
        }}</ElTag>
      </div>
      <ElDescriptions :column="2" border>
        <ElDescriptionsItem :label="xt('当前修订')">v{{ detail.revision }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="xt('默认模型')">{{
          detail.defaultModel || '-'
        }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="xt('默认助手')">{{
          detail.defaultAssistant?.name || '-'
        }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="xt('最后更新')">{{
          formatDate(detail.updatedAt)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="xt('说明')" :span="2">{{
          detail.description || '-'
        }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="xt('项目指令')" :span="2">
          <pre>{{ detail.instructions || '-' }}</pre>
        </ElDescriptionsItem>
      </ElDescriptions>
      <ElDivider content-position="left">{{ xt('工作步骤') }}</ElDivider>
      <ElTimeline v-if="projectSteps.length">
        <ElTimelineItem
          v-for="step in projectSteps"
          :key="step.id"
          :type="
            step.status === 'DONE' ? 'success' : step.status === 'IN_PROGRESS' ? 'warning' : 'info'
          "
        >
          <strong>{{ step.title }}</strong
          ><ElTag size="small" effect="plain">{{ statusText(step.status) }}</ElTag>
          <p>{{ step.description || xt('无步骤说明') }}</p>
        </ElTimelineItem>
      </ElTimeline>
      <ElEmpty v-else :description="xt('该项目尚未配置工作步骤')" :image-size="72" />
      <ElDivider content-position="left">{{ xt('编辑工作流') }}</ElDivider>
      <ElForm label-position="top" class="admin-workflow-editor">
        <ElRow :gutter="14">
          <ElCol :span="8"
            ><ElFormItem :label="xt('状态')"
              ><ElSelect v-model="form.workflowStatus" class="wide"
                ><ElOption :label="xt('规划中')" value="PLANNING" /><ElOption
                  :label="xt('进行中')"
                  value="IN_PROGRESS" /><ElOption :label="xt('待审核')" value="REVIEW" /><ElOption
                  :label="xt('已完成')"
                  value="COMPLETED" /><ElOption
                  :label="xt('已归档')"
                  value="ARCHIVED" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('默认模型')"
              ><ElSelect v-model="form.defaultModel" class="wide" filterable clearable allow-create
                ><ElOption
                  v-for="model in lookups.models"
                  :key="model.id || model.key"
                  :label="model.name || model.key"
                  :value="model.key || model.name" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('默认助手')"
              ><ElSelect v-model="form.defaultAssistantId" class="wide" filterable clearable
                ><ElOption
                  v-for="assistant in lookups.assistants"
                  :key="assistant.id"
                  :label="assistant.name"
                  :value="assistant.id" /></ElSelect></ElFormItem
          ></ElCol>
        </ElRow>
        <ElFormItem :label="xt('项目指令')"
          ><ElInput
            v-model="form.instructions"
            type="textarea"
            :rows="3"
            maxlength="4000"
            show-word-limit
        /></ElFormItem>
        <ElFormItem :label="xt('默认提示词')"
          ><ElInput
            v-model="form.defaultPrompt"
            type="textarea"
            :rows="3"
            maxlength="10000"
            show-word-limit
        /></ElFormItem>
        <ElFormItem :label="xt('输出要求')"
          ><ElInput
            v-model="form.outputRequirements"
            type="textarea"
            :rows="3"
            maxlength="10000"
            show-word-limit
        /></ElFormItem>
        <div class="workflow-editor-heading"
          ><strong>{{ xt('工作步骤') }}</strong
          ><ElButton size="small" @click="emit('add-step')"
            ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增步骤') }}</ElButton
          ></div
        >
        <div v-if="form.steps.length" class="workflow-step-list">
          <div v-for="(step, index) in form.steps" :key="step.id" class="workflow-step-row">
            <span class="workflow-step-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <ElInput v-model="step.title" :placeholder="xt('步骤名称')" maxlength="120" />
            <ElInput
              v-model="step.description"
              :placeholder="xt('目标和交付物（可选）')"
              maxlength="1000"
            />
            <ElSelect v-model="step.status" :aria-label="xt('步骤状态')"
              ><ElOption :label="xt('待开始')" value="TODO" /><ElOption
                :label="xt('进行中')"
                value="IN_PROGRESS" /><ElOption :label="xt('已完成')" value="DONE"
            /></ElSelect>
            <ElButton
              circle
              text
              type="danger"
              :aria-label="xt('删除步骤')"
              @click="emit('remove-step', index)"
              ><ArtSvgIcon icon="ri:delete-bin-line"
            /></ElButton>
          </div>
        </div>
        <ElEmpty v-else :description="xt('尚未配置步骤')" :image-size="56" />
      </ElForm>
      <div class="workflow-editor-actions"
        ><ElButton @click="emit('update:modelValue', false)">{{ xt('关闭') }}</ElButton
        ><ElButton type="primary" :loading="saving" @click="emit('save')">{{
          xt('保存工作流')
        }}</ElButton></div
      >
      <ElDivider content-position="left">{{ xt('版本历史') }}</ElDivider>
      <ElCollapse accordion>
        <ElCollapseItem
          v-for="version in detail.versions || []"
          :key="version.id"
          :name="version.id"
        >
          <template #title
            ><div class="version-title"
              ><strong>v{{ version.version }} · {{ version.label || xt('未命名版本') }}</strong
              ><span>{{ version.changeSummary || xt('无变更说明') }}</span
              ><time>{{ formatDate(version.createdAt) }}</time></div
            ></template
          >
          <pre>{{ JSON.stringify(version.snapshot, null, 2) }}</pre>
        </ElCollapseItem>
      </ElCollapse>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { xinyueText as xt } from '@/locales/xinyue'
  import type { ResourceRow as Row } from './resource-types'

  const props = defineProps<{
    modelValue: boolean
    detail: Row | null
    lookups: Record<string, Row[]>
    saving: boolean
    statusText: (value: unknown) => string
    statusType: (value: unknown) => any
    formatDate: (value: unknown) => string
  }>()
  const form = defineModel<Row>('form', { required: true })
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    'add-step': []
    'remove-step': [index: number]
    save: []
  }>()
  const projectSteps = computed<Row[]>(() => {
    const steps = props.detail?.workflowConfig?.steps
    return Array.isArray(steps) ? steps : []
  })
</script>

<style scoped>
  .wide {
    width: 100%;
  }
  .project-audit-head {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 18px;
  }
  .project-audit-head strong {
    font-size: 18px;
  }
  .project-audit-head p {
    margin: 5px 0 0;
    font-size: 12px;
    color: var(--art-gray-500);
  }
  .project-audit-head + :deep(.el-descriptions) {
    margin-bottom: 20px;
  }
  .admin-workflow-editor {
    padding: 2px 0 8px;
  }
  .workflow-editor-heading,
  .workflow-editor-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
  .workflow-editor-heading {
    margin: 4px 0 10px;
  }
  .workflow-editor-actions {
    justify-content: flex-end;
    margin-top: 14px;
  }
  .workflow-step-list {
    display: grid;
    gap: 8px;
  }
  .workflow-step-row {
    display: grid;
    grid-template-columns: 28px minmax(120px, 1fr) minmax(160px, 1.4fr) 120px 32px;
    gap: 8px;
    align-items: center;
  }
  .workflow-step-index {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--art-gray-500);
    text-align: center;
  }
  :deep(.el-timeline-item__content) > strong {
    margin-right: 8px;
  }
  :deep(.el-timeline-item__content) > p {
    margin: 5px 0 0;
    line-height: 1.6;
    color: var(--art-gray-500);
  }
  .version-title {
    display: grid;
    grid-template-columns: minmax(150px, auto) minmax(140px, 1fr) auto;
    gap: 12px;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding-right: 12px;
  }
  .version-title span {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--art-gray-500);
    white-space: nowrap;
  }
  .version-title time {
    font-size: 12px;
    color: var(--art-gray-500);
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
  @media (width <= 768px) {
    .version-title {
      grid-template-columns: 1fr;
      gap: 2px;
    }
    .version-title time {
      display: none;
    }
    .workflow-step-row {
      grid-template-columns: 24px minmax(0, 1fr) 32px;
    }
    .workflow-step-row .el-select,
    .workflow-step-row .el-input:nth-child(3) {
      grid-column: 2 / -1;
    }
  }
</style>
