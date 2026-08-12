<template>
  <div class="search-channel-page">
    <header class="page-title"><div><h1>联网搜索</h1><p>为 Agent 配置实时检索渠道、优先级和自动故障切换</p></div><ElSpace><ElButton :loading="checkingAll" @click="checkAll"><ArtSvgIcon icon="ri:pulse-line" />批量检测</ElButton><ElButton type="primary" @click="openEditor()"><ArtSvgIcon icon="ri:add-line" />新增渠道</ElButton></ElSpace></header>
    <ElAlert v-if="summary" :title="`检测完成：${summary.healthy}/${summary.checked} 个渠道正常`" :type="summary.unhealthy ? 'warning' : 'success'" show-icon closable />
    <ElCard shadow="never" class="table-card">
      <ElTable v-loading="loading" :data="rows" height="100%">
        <ElTableColumn label="渠道" min-width="220"><template #default="{ row }"><div class="channel-name"><span :class="providerTone(row.type)"><ArtSvgIcon icon="ri:search-eye-line" /></span><div><strong>{{ row.name }}</strong><small>{{ providerText[row.type] || row.type }} · 优先级 {{ row.priority }}</small></div></div></template></ElTableColumn>
        <ElTableColumn label="接口地址" min-width="250"><template #default="{ row }"><span class="endpoint">{{ row.endpoint }}</span><small class="note">密钥 {{ row.hasApiKey ? row.apiKeyHint : '未配置' }}</small></template></ElTableColumn>
        <ElTableColumn label="运行参数" min-width="150"><template #default="{ row }">{{ row.maxResults }} 条结果<small class="note">超时 {{ row.timeoutMs / 1000 }} 秒</small></template></ElTableColumn>
        <ElTableColumn label="健康状态" width="125"><template #default="{ row }"><ElTooltip :content="row.lastHealthMessage || '尚未检测'"><ElTag :type="healthType(row)">{{ healthText(row) }}</ElTag></ElTooltip><small v-if="row.consecutiveFailures" class="note danger">连续失败 {{ row.consecutiveFailures }}</small></template></ElTableColumn>
        <ElTableColumn label="请求 / 失败" width="120"><template #default="{ row }">{{ row.totalRequests }} / {{ row.totalFailures }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="90"><template #default="{ row }"><ElTag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="操作" width="190" fixed="right"><template #default="{ row }"><ElButton link type="primary" :loading="checking === row.id" @click="check(row)">检测</ElButton><ElButton link @click="openEditor(row)">编辑</ElButton><ElButton link type="danger" @click="remove(row)">删除</ElButton></template></ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog v-model="dialog" :title="form.id ? '编辑搜索渠道' : '新增搜索渠道'" width="660px" destroy-on-close>
      <ElForm label-position="top">
        <ElRow :gutter="14"><ElCol :span="12"><ElFormItem label="渠道名称"><ElInput v-model.trim="form.name" maxlength="100" /></ElFormItem></ElCol><ElCol :span="12"><ElFormItem label="服务类型"><ElSelect v-model="form.type" class="wide" @change="applyEndpoint"><ElOption v-for="item in providers" :key="item.value" :label="item.label" :value="item.value" /></ElSelect></ElFormItem></ElCol></ElRow>
        <ElFormItem label="接口地址"><ElInput v-model.trim="form.endpoint" placeholder="https://..." /></ElFormItem>
        <ElFormItem label="API 密钥"><ElInput v-model="form.apiKey" type="password" show-password :placeholder="form.id && form.hasApiKey ? `留空保留 ${form.apiKeyHint}` : '输入服务密钥'" /></ElFormItem>
        <ElCheckbox v-if="form.id && form.hasApiKey" v-model="form.clearApiKey">清除已保存密钥</ElCheckbox>
        <ElRow :gutter="14"><ElCol :span="8"><ElFormItem label="优先级"><ElInputNumber v-model="form.priority" :min="-10000" :max="10000" class="wide" /></ElFormItem></ElCol><ElCol :span="8"><ElFormItem label="超时毫秒"><ElInputNumber v-model="form.timeoutMs" :min="1000" :max="60000" :step="1000" class="wide" /></ElFormItem></ElCol><ElCol :span="8"><ElFormItem label="最大结果数"><ElInputNumber v-model="form.maxResults" :min="1" :max="20" class="wide" /></ElFormItem></ElCol></ElRow>
        <ElFormItem label="高级配置（JSON）"><ElInput v-model="form.configText" type="textarea" :rows="6" placeholder='{"searchDepth":"advanced"}' /><small class="help">Tavily 可设置 searchDepth；Serper 可传 gl、hl。自定义渠道支持 method、headers、body、queryParam、maxResultsParam，以及 resultPath、titleField、urlField、contentField、publishedAtField、answerPath 响应映射。</small></ElFormItem>
        <ElSwitch v-model="form.enabled" active-text="启用渠道" />
      </ElForm>
      <template #footer><ElButton @click="dialog = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">保存渠道</ElButton></template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage, ElMessageBox } from 'element-plus'
  import request from '@/utils/http'
  defineOptions({ name: 'XinyueWebSearchChannels' })
  type Row = Record<string, any>
  const defaults: Record<string, string> = { TAVILY: 'https://api.tavily.com/search', SERPER: 'https://google.serper.dev/search', BRAVE: 'https://api.search.brave.com/res/v1/web/search', EXA: 'https://api.exa.ai/search', CUSTOM: '' }
  const providerText: Record<string, string> = { TAVILY: 'Tavily', SERPER: 'Google Serper', BRAVE: 'Brave Search', EXA: 'Exa', CUSTOM: '自定义兼容接口' }
  const providers = Object.entries(providerText).map(([value, label]) => ({ value, label }))
  const emptyForm = () => ({ id: '', name: '', type: 'TAVILY', endpoint: defaults.TAVILY, apiKey: '', apiKeyHint: '', hasApiKey: false, clearApiKey: false, enabled: true, priority: 0, timeoutMs: 30000, maxResults: 8, configText: '{}' })
  const rows = ref<Row[]>([]), loading = ref(false), saving = ref(false), dialog = ref(false), checking = ref(''), checkingAll = ref(false), summary = ref<Row | null>(null)
  const form = reactive(emptyForm())
  function providerTone(type: string) { return `provider-icon ${type.toLowerCase()}` }
  function healthText(row: Row) { return row.lastHealthStatus === 'healthy' ? '正常' : row.lastHealthStatus === 'unhealthy' ? '异常' : '未检测' }
  function healthType(row: Row) { return row.lastHealthStatus === 'healthy' ? 'success' : row.lastHealthStatus === 'unhealthy' ? 'danger' : 'info' }
  async function load() { loading.value = true; try { rows.value = await request.get<Row[]>({ url: '/v1/admin/web-search-channels' }) } finally { loading.value = false } }
  function openEditor(row?: Row) { Object.assign(form, emptyForm(), row || {}, { apiKey: '', clearApiKey: false, configText: JSON.stringify(row?.config || {}, null, 2) }); dialog.value = true }
  function applyEndpoint() { if (!form.id || !form.endpoint || Object.values(defaults).includes(form.endpoint)) form.endpoint = defaults[form.type] }
  async function save() { if (!form.name || !form.endpoint) return ElMessage.warning('请填写渠道名称和接口地址'); let config: Row; try { config = JSON.parse(form.configText || '{}') } catch { return ElMessage.warning('高级配置不是有效 JSON') }; saving.value = true; try { const body = { name: form.name, type: form.type, endpoint: form.endpoint, apiKey: form.apiKey || undefined, clearApiKey: form.clearApiKey, enabled: form.enabled, priority: form.priority, timeoutMs: form.timeoutMs, maxResults: form.maxResults, config }; await request.request({ url: form.id ? `/v1/admin/web-search-channels/${form.id}` : '/v1/admin/web-search-channels', method: form.id ? 'PATCH' : 'POST', data: body, showSuccessMessage: true }); dialog.value = false; await load() } finally { saving.value = false } }
  async function check(row: Row) { checking.value = row.id; try { await request.post({ url: `/v1/admin/web-search-channels/${row.id}/check`, params: {}, showSuccessMessage: true }); await load() } finally { checking.value = '' } }
  async function checkAll() { checkingAll.value = true; try { summary.value = await request.post<Row>({ url: '/v1/admin/web-search-channels/check-all', params: {} }); await load() } finally { checkingAll.value = false } }
  async function remove(row: Row) { await ElMessageBox.confirm(`确认删除“${row.name}”？`, '删除搜索渠道', { type: 'warning' }); await request.del({ url: `/v1/admin/web-search-channels/${row.id}`, showSuccessMessage: true }); await load() }
  onMounted(load)
</script>

<style scoped>
  .search-channel-page { display: flex; min-height: 0; flex-direction: column; gap: 14px; }
  .page-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; } .page-title h1 { margin: 0; font-size: 20px; } .page-title p { margin: 4px 0 0; color: var(--art-gray-500); font-size: 12px; }
  .table-card { min-height: 560px; overflow: hidden; } .table-card :deep(.el-card__body) { height: 100%; min-height: 0; padding: 0; }
  .channel-name { display: flex; align-items: center; gap: 11px; } .channel-name > span { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border-radius: 6px; color: #2563eb; background: #eff6ff; font-size: 18px; } .channel-name > div { display: grid; min-width: 0; }
  .channel-name small, .note, .help { display: block; color: var(--art-gray-500); font-size: 11px; line-height: 1.5; } .danger { color: var(--el-color-danger); }
  .endpoint { display: block; overflow: hidden; font-family: Consolas, monospace; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; } .wide { width: 100%; } .help { margin-top: 6px; }
  @media (max-width: 720px) { .page-title { align-items: flex-start; flex-direction: column; } }
</style>
