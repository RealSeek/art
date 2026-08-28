<template>
  <ElDrawer
    :model-value="modelValue"
    :title="xt('处理客服工单')"
    size="680px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="ticket">
      <div class="ticket-header">
        <div
          ><strong>{{ ticket.subject }}</strong
          ><p>{{ ticket.user?.displayName }} · {{ ticket.user?.email }}</p></div
        >
        <ElTag :type="statusType(ticket.status)">{{ statusText(ticket.status) }}</ElTag>
      </div>
      <ElForm label-position="top" class="ticket-settings">
        <ElRow :gutter="14">
          <ElCol :span="8"
            ><ElFormItem :label="xt('状态')"
              ><ElSelect v-model="form.status" class="wide"
                ><ElOption
                  v-for="option in statusOptions"
                  :key="String(option.value)"
                  :label="xt(option.label)"
                  :value="option.value" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('优先级')"
              ><ElSelect v-model="form.priority" class="wide"
                ><ElOption
                  v-for="option in priorityOptions"
                  :key="String(option.value)"
                  :label="xt(option.label)"
                  :value="option.value" /></ElSelect></ElFormItem
          ></ElCol>
          <ElCol :span="8"
            ><ElFormItem :label="xt('负责人')"
              ><ElSelect v-model="form.assignedToId" clearable class="wide"
                ><ElOption
                  v-for="agent in agents"
                  :key="agent.id"
                  :label="agent.displayName || agent.email"
                  :value="agent.id" /></ElSelect></ElFormItem
          ></ElCol>
        </ElRow>
        <ElButton type="primary" plain :loading="saving" @click="emit('update-ticket')">{{
          xt('更新工单')
        }}</ElButton>
      </ElForm>
      <ElDivider content-position="left">{{ xt('沟通记录') }}</ElDivider>
      <div class="ticket-messages">
        <div
          v-for="message in ticket.messages"
          :key="message.id"
          class="ticket-message"
          :class="{ admin: message.authorType === 'ADMIN' }"
        >
          <div
            ><strong>{{
              message.author?.displayName ||
              (message.authorType === 'ADMIN' ? xt('管理员') : xt('用户'))
            }}</strong
            ><time>{{ formatDate(message.createdAt) }}</time></div
          >
          <p>{{ message.body }}</p>
        </div>
      </div>
      <ElForm label-position="top" class="ticket-reply">
        <ElFormItem :label="xt('回复用户')"
          ><ElInput
            v-model.trim="form.reply"
            type="textarea"
            :rows="4"
            maxlength="10000"
            show-word-limit
        /></ElFormItem>
        <ElButton type="primary" :loading="saving" @click="emit('reply')">{{
          xt('发送回复')
        }}</ElButton>
      </ElForm>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { xinyueText as xt } from '@/locales/xinyue'
  import type { ResourceRow as Row, ResourceSelectOption as SelectOption } from './resource-types'

  defineProps<{
    modelValue: boolean
    ticket: Row | null
    agents: Row[]
    statusOptions: SelectOption[]
    priorityOptions: SelectOption[]
    saving: boolean
    statusText: (value: unknown) => string
    statusType: (value: unknown) => any
    formatDate: (value: unknown) => string
  }>()
  const form = defineModel<Row>('form', { required: true })
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    'update-ticket': []
    reply: []
  }>()
</script>

<style scoped>
  .wide {
    width: 100%;
  }
  .ticket-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: 16px;
  }
  .ticket-header strong {
    font-size: 17px;
  }
  .ticket-header p {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--art-gray-500);
  }
  .ticket-settings,
  .ticket-reply {
    padding: 16px;
    background: var(--default-bg-color);
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }
  .ticket-messages {
    display: grid;
    gap: 10px;
    max-height: 360px;
    margin-bottom: 18px;
    overflow: auto;
  }
  .ticket-message {
    max-width: 88%;
    padding: 12px 14px;
    background: var(--default-box-color);
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }
  .ticket-message.admin {
    margin-left: auto;
    background: color-mix(in srgb, var(--main-color) 7%, var(--default-box-color));
    border-color: color-mix(in srgb, var(--main-color) 28%, transparent);
  }
  .ticket-message > div {
    display: flex;
    gap: 18px;
    justify-content: space-between;
    font-size: 12px;
  }
  .ticket-message time {
    color: var(--art-gray-500);
  }
  .ticket-message p {
    margin: 7px 0 0;
    line-height: 1.65;
    white-space: pre-wrap;
  }
</style>
