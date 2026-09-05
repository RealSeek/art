<template>
  <h2 id="settings-api">API 与模型</h2>
  <p class="settings-section-intro">按用途接入 OnlyCode 密钥，模型会在接入后自动同步。</p>

  <section class="settings-capability-grid" aria-label="OnlyCode 接入分类">
    <article v-for="item in capabilityItems" :key="item.capability" :class="`is-${item.capability.toLowerCase()}`">
      <header>
        <span class="settings-capability-icon"><component :is="item.icon" :size="19" /></span>
        <div>
          <strong>{{ item.label }}</strong>
          <small>{{ item.description }}</small>
        </div>
        <em>{{ groupsLoading ? '加载中' : `${groupsFor(item.capability).length} 个分组` }}</em>
      </header>

      <label class="settings-capability-group">
        <span>OnlyCode 分组</span>
        <select v-model="selectedGroups[item.capability]" :disabled="groupsLoading || !groupsFor(item.capability).length">
          <option v-if="groupsLoading" value="">正在加载开放分组...</option>
          <option v-else-if="!groupsFor(item.capability).length" value="">管理员暂未开放此类分组</option>
          <option v-for="group in groupsFor(item.capability)" :key="group.name" :value="group.name">
            {{ group.name }} · {{ group.models.length }} 个模型 · x{{ group.ratio }}
          </option>
        </select>
      </label>

      <p v-if="selectedGroup(item.capability)" class="settings-capability-models">
        创建后自动同步该分组的 {{ selectedGroup(item.capability)?.models.length }} 个模型，无需复制密钥。
      </p>
      <p v-else class="settings-capability-models">仍可使用已有 OnlyCode 密钥手动接入。</p>

      <footer>
        <button
          type="button"
          class="is-primary"
          :disabled="!selectedGroups[item.capability] || Boolean(provisioningBusyGroup)"
          @click="handleProvision(item.capability)"
        >
          <WandSparkles :size="15" />
          {{ provisioningBusyGroup && provisioningBusyGroup === selectedGroups[item.capability] ? '正在接入...' : '一键创建并导入' }}
        </button>
        <button type="button" @click="openCredentialEditor()"><KeyRound :size="15" />手动填写密钥</button>
      </footer>
    </article>
  </section>

  <div class="settings-action-row settings-api-heading">
    <span><strong>已接入密钥</strong><small>OnlyArt 只会显示密钥末尾四位。</small></span>
  </div>
  <section class="settings-api-list">
    <article v-for="item in apiCredentials" :key="item.id">
      <div>
        <strong>{{ item.name }}<em v-if="item.isDefault">默认</em></strong>
        <small>OnlyCode<template v-if="item.provisionKey"> · {{ item.provisionKey }}</template> · {{ item.apiKeyHint }} · {{ item.totalRequests || 0 }} 次调用<span v-if="item.expiresAt"> · {{ formatServerDate(item.expiresAt) }} 到期</span></small>
        <p>{{ item.baseUrl }}</p>
      </div>
      <span class="settings-api-state" :class="{ disabled: !item.enabled || item.lastHealthStatus === 'unhealthy' }">{{ item.lastHealthStatus === 'healthy' ? '连接正常' : item.lastHealthStatus === 'unhealthy' ? '连接异常' : item.enabled ? '待检测' : '已停用' }}</span>
      <footer>
        <button type="button" :disabled="credentialCheckingId === item.id" @click="discoverCredential(item)">{{ credentialCheckingId === item.id ? '检测中' : '检测并导入模型' }}</button>
        <button type="button" @click="openCredentialEditor(item)">编辑</button>
        <button type="button" class="danger-button" @click="deleteCredential(item)">删除</button>
      </footer>
    </article>
    <p v-if="!apiCredentials.length">还没有接入密钥，可从上方选择分类开始。</p>
  </section>
</template>

<script setup lang="ts">
import { reactive, watch, type Component } from 'vue'
import { Image, KeyRound, MessageCircle, Video, WandSparkles } from 'lucide-vue-next'
import { formatServerDate } from '../../format'
import type { ApiCredential, CapabilityType, OnlyCodeGroupInfo } from '../../types'

const props = defineProps<{
  provisioningGroupDetails: OnlyCodeGroupInfo[]
  groupsLoading: boolean
  provisioningBusyGroup: string
  apiCredentials: ApiCredential[]
  credentialCheckingId: string
  openCredentialEditor: (item?: ApiCredential) => void
  discoverCredential: (item: ApiCredential) => Promise<void>
  deleteCredential: (item: ApiCredential) => Promise<void>
  provisionOnlyCode: (group: string, name: string) => Promise<boolean>
}>()

const capabilityItems: Array<{ capability: CapabilityType; label: string; description: string; icon: Component }> = [
  { capability: 'CHAT', label: '对话', description: '问答、推理与代码模型', icon: MessageCircle },
  { capability: 'IMAGE', label: '生图', description: '图片生成与编辑模型', icon: Image },
  { capability: 'VIDEO', label: '视频', description: '视频生成与处理模型', icon: Video },
]
const selectedGroups = reactive<Record<CapabilityType, string>>({ CHAT: '', IMAGE: '', VIDEO: '' })

function groupsFor(capability: CapabilityType) {
  return props.provisioningGroupDetails.filter((group) => group.capabilities.includes(capability))
}

watch(() => props.provisioningGroupDetails, () => {
  for (const item of capabilityItems) {
    const groups = groupsFor(item.capability)
    if (!groups.some((group) => group.name === selectedGroups[item.capability])) {
      selectedGroups[item.capability] = groups[0]?.name || ''
    }
  }
}, { immediate: true })

function selectedGroup(capability: CapabilityType) {
  return props.provisioningGroupDetails.find((group) => group.name === selectedGroups[capability])
}

async function handleProvision(capability: CapabilityType) {
  const group = selectedGroups[capability]
  if (group) await props.provisionOnlyCode(group, '')
}
</script>
