<template>
  <h2 id="settings-api">API 与模型</h2>
  <template>
    <section class="settings-routing-overview">
      <header><div><strong>OnlyCode 分组密钥</strong><small>选择管理员开放的分组并直接接入。</small></div></header>
      <div class="settings-routing-grid">
        <article><span><KeyRound :size="18" /></span><div><strong>个人 API 密钥</strong><small>{{ apiCredentials.length ? `${apiCredentials.filter((item) => item.enabled).length} 个已启用，任务会使用你的密钥` : '尚未接入分组' }}</small></div><em :class="{ inactive: !apiCredentials.some((item) => item.enabled) }">{{ apiCredentials.some((item) => item.enabled) ? '已接入' : '未接入' }}</em></article>
      </div>
      <div v-if="availableModels.length" class="settings-model-tags"><span v-for="item in availableModels.slice(0, 8)" :key="item.key">{{ item.displayName }}<small>{{ modelCapabilityLabel[item.capability] || item.capability }}</small></span><em v-if="availableModels.length > 8">+{{ availableModels.length - 8 }}</em></div>
    </section>
    <section v-if="provisioningGroups.length" class="settings-provision-groups">
      <article v-for="group in provisioningGroups" :key="group">
        <div><strong>{{ group }}</strong><small>{{ connectedGroup(group)?.name || '可创建' }}</small></div>
        <input v-if="!connectedGroup(group)" v-model.trim="names[group]" type="text" maxlength="50" :placeholder="`onlyart-用户名-${group}`" />
        <span v-else class="settings-provision-connected">{{ connectedGroup(group)?.apiKeyHint }}</span>
        <button type="button" :disabled="Boolean(provisioningBusyGroup)" @click="provisionOnlyCode(group, names[group] || '')"><RefreshCw v-if="connectedGroup(group)" :size="15" /><CirclePlus v-else :size="15" />{{ provisioningBusyGroup === group ? '处理中' : connectedGroup(group) ? '同步模型' : '创建并接入' }}</button>
      </article>
    </section>
    <p v-else class="settings-provision-empty">管理员暂未开放可创建的 OnlyCode 分组。</p>
    <div class="settings-action-row"><span><strong>我的上游密钥</strong><small>自动创建的密钥会加密保存。</small></span></div>
    <section class="settings-api-list"><article v-for="item in apiCredentials" :key="item.id"><div><strong>{{ item.name }}<em v-if="item.isDefault">默认</em></strong><small>{{ providerTypeLabel[item.providerType] }}<template v-if="item.provisionKey"> · {{ item.provisionKey }}</template> · {{ item.apiKeyHint }} · {{ item.totalRequests || 0 }} 次调用<span v-if="item.expiresAt"> · {{ formatServerDate(item.expiresAt) }} 到期</span></small><p>{{ item.baseUrl }}</p></div><span class="settings-api-state" :class="{ disabled: !item.enabled || item.lastHealthStatus === 'unhealthy' }">{{ item.lastHealthStatus === 'healthy' ? '连接正常' : item.lastHealthStatus === 'unhealthy' ? '连接异常' : item.enabled ? '待检测' : '已停用' }}</span><footer><button type="button" :disabled="credentialCheckingId === item.id" @click="discoverCredential(item)">{{ credentialCheckingId === item.id ? '检测中' : '检测并导入模型' }}</button><button type="button" @click="openCredentialEditor(item)">编辑</button><button type="button" class="danger-button" @click="deleteCredential(item)">删除</button></footer></article><p v-if="!apiCredentials.length">尚未接入 OnlyCode 分组。</p></section>
    <div class="settings-action-row"><span><strong>我的模型</strong><small>一个模型可以绑定多个密钥，并按优先级、权重或轮询策略切换。</small></span><button type="button" :disabled="!apiCredentials.length" @click="openPrivateModelEditor()"><CirclePlus :size="15" />添加模型</button></div>
    <section class="settings-api-list settings-private-models"><article v-for="item in privateModels" :key="item.id"><div><strong>{{ item.displayName }}<em v-if="item.isDefault">默认</em></strong><small>{{ modelCapabilityLabel[item.capability] }} · {{ routingStrategyLabel[item.routingStrategy] || item.routingStrategy }}</small><p>{{ item.routes.length }} 条密钥路由 · {{ item.routes.filter((route) => route.enabled && route.credential.enabled).length }} 条已启用</p></div><span class="settings-api-state" :class="{ disabled: !item.enabled || !item.routes.some((route) => route.enabled && route.credential.enabled) }">{{ item.enabled ? '已启用' : '已停用' }}</span><footer><button type="button" @click="openPrivateModelEditor(item)">编辑路由</button><button type="button" class="danger-button" @click="deletePrivateModel(item)">删除</button></footer></article><p v-if="!privateModels.length">尚未配置私有模型。检测密钥后可直接导入上游模型。</p></section>
  </template>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { CirclePlus, KeyRound, RefreshCw } from 'lucide-vue-next'
import { formatServerDate } from '../../format'
import { modelCapabilityLabel, providerTypeLabel, routingStrategyLabel } from '../../labels'
import type { ApiCredential, AvailableModel, PrivateModel } from '../../types'

const props = defineProps<{
  newApiConsoleUrl: string
  provisioningGroups: string[]
  provisioningBusyGroup: string
  availableModels: AvailableModel[]
  apiCredentials: ApiCredential[]
  credentialCheckingId: string
  privateModels: PrivateModel[]
  openCredentialEditor: (item?: ApiCredential) => void
  discoverCredential: (item: ApiCredential) => Promise<void>
  deleteCredential: (item: ApiCredential) => Promise<void>
  openPrivateModelEditor: (item?: PrivateModel, credentialId?: string, upstreamModel?: string) => void
  deletePrivateModel: (item: PrivateModel) => Promise<void>
  provisionOnlyCode: (group: string, name: string) => Promise<void>
}>()

const names = reactive<Record<string, string>>({})
function connectedGroup(group: string) {
  return props.apiCredentials.find((item) => item.provisionKey === group)
}
</script>
