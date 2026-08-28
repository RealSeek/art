<template>
  <ElDrawer
    :model-value="modelValue"
    :title="xt('内容审核策略')"
    size="560px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElForm v-if="policy" label-position="top">
      <div class="switch-grid">
        <label v-for="item in switches" :key="item.key">
          <span
            ><strong>{{ xt(item.title) }}</strong
            ><small>{{ xt(item.description) }}</small></span
          >
          <ElSwitch v-model="policy[item.key]" />
        </label>
      </div>
      <ElFormItem :label="xt('用户提示语')">
        <ElInput
          v-model="policy.blockMessage"
          type="textarea"
          :rows="3"
          maxlength="300"
          show-word-limit
        />
      </ElFormItem>
      <ElFormItem :label="xt('摘要最大长度')">
        <ElInputNumber
          v-model="policy.excerptLength"
          :min="40"
          :max="1000"
          controls-position="right"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">{{ xt('取消') }}</ElButton>
      <ElButton type="primary" :loading="saving" @click="emit('save')">{{
        xt('保存策略')
      }}</ElButton>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts">
  import { xinyueText as xt } from '@/locales/xinyue'
  import type { ResourceRow as Row } from './resource-types'

  defineProps<{ modelValue: boolean; saving: boolean }>()
  const policy = defineModel<Row | null>('policy', { required: true })
  const emit = defineEmits<{ 'update:modelValue': [value: boolean]; save: [] }>()

  const switches = [
    { key: 'enabled', title: '启用内容审核', description: '统一控制全部内容入口' },
    { key: 'scanChat', title: '扫描聊天', description: '发送模型前检查消息' },
    { key: 'scanImage', title: '扫描图片提示词', description: '创建图片任务前检查' },
    { key: 'scanCommerce', title: '扫描商品视觉', description: '创建商品图任务前检查' },
    { key: 'failClosed', title: '审核故障时阻断', description: '安全服务异常时拒绝请求' },
    { key: 'retainContent', title: '保留内容摘要', description: '审核事件中保存受控摘要' }
  ]
</script>

<style scoped>
  .switch-grid {
    display: grid;
    gap: 1px;
    margin-bottom: 22px;
    overflow: hidden;
    background: var(--art-gray-200);
    border: 1px solid var(--art-gray-200);
    border-radius: 6px;
  }

  .switch-grid label {
    display: flex;
    gap: 20px;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--default-box-color);
  }

  .switch-grid label span {
    display: grid;
    gap: 3px;
  }

  .switch-grid small {
    display: block;
    font-size: 12px;
    line-height: 1.5;
    color: var(--art-gray-500);
  }
</style>
