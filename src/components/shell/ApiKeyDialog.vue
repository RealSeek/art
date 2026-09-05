<template>
  <div class="settings-credential-layer" @mousedown.self="emit('close')">
    <form class="settings-credential-editor" @submit.prevent="saveCredential">
      <header>
        <div><h3>{{ editor.id ? '编辑 API 密钥' : '添加 API 密钥' }}</h3><p>密钥会加密保存在服务器，页面只显示末尾四位。</p></div>
        <button type="button" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>
      <label><span>API 密钥</span><input v-model.trim="editor.apiKey" :required="!editor.id" type="password" autocomplete="new-password" :placeholder="editor.id ? '留空保留 ' + editor.apiKeyHint : 'sk-...'" /></label>
      <div class="settings-credential-routing">
        <label><span>优先级</span><input v-model.number="editor.priority" type="number" min="-10000" max="10000" /></label>
        <label><span>权重</span><input v-model.number="editor.weight" type="number" min="1" max="10000" /></label>
      </div>
      <div class="settings-credential-toggles">
        <label><input v-model="editor.enabled" type="checkbox" />启用</label>
        <label><input v-model="editor.isDefault" type="checkbox" />设为默认密钥</label>
        <label><input v-model="editor.autoImport" type="checkbox" />保存后自动识别并导入全部可用模型</label>
      </div>
      <p v-if="credentialError" class="settings-feedback is-error">{{ credentialError }}</p>
      <footer><button type="button" @click="emit('close')">取消</button><button type="submit" :disabled="credentialSaving">{{ credentialSaving ? '保存中' : '保存' }}</button></footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import type { CredentialEditor } from './types'

defineProps<{
  editor: CredentialEditor
  credentialSaving: boolean
  credentialError: string
  saveCredential: () => Promise<void>
}>()

const emit = defineEmits<{
  close: []
}>()
</script>
