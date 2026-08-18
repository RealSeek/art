<template>
  <section class="model-catalog-picker" role="dialog" :aria-label="title" :style="{ '--picker-content-height': `${pickerHeight}px` }">
    <header class="model-catalog-picker__header">
      <span class="model-catalog-picker__heading">
        <strong>{{ title }}</strong>
        <small>按来源和厂商筛选</small>
      </span>
      <label>
        <Search :size="16" />
        <input v-model.trim="query" type="search" placeholder="搜索模型名称、厂商或模型 ID" aria-label="搜索模型" />
      </label>
    </header>

    <div v-if="matchingModels.length" class="model-catalog-picker__body">
      <nav class="model-catalog-picker__sources" aria-label="模型来源">
        <span class="model-catalog-picker__column-title">来源</span>
        <button v-for="source in sourceGroups" :key="source.key" type="button" :class="{ 'is-active': activeSource === source.key }" @click="selectSource(source.key)">
          <span class="model-catalog-picker__source-icon"><KeyRound v-if="source.key === 'USER'" :size="16" /><Sparkles v-else :size="16" /></span>
          <strong>{{ source.label }}</strong>
          <small>{{ source.count }}</small>
        </button>
      </nav>

      <nav class="model-catalog-picker__vendors" aria-label="模型厂商">
        <span class="model-catalog-picker__column-title">厂商</span>
        <button v-for="vendor in vendorGroups" :key="vendor.key" type="button" :class="{ 'is-active': activeVendor === vendor.key }" @click="activeVendor = vendor.key">
          <span>{{ vendor.initial }}</span>
          <strong>{{ vendor.label }}</strong>
          <small>{{ vendor.count }}</small>
        </button>
      </nav>

      <div class="model-catalog-picker__models" role="listbox" :aria-label="`${activeVendorLabel}模型`">
        <div class="model-catalog-picker__models-heading">
          <span><strong>{{ activeVendorLabel }}</strong><small>{{ visibleModels.length }} 个模型</small></span>
        </div>
        <div class="model-catalog-picker__model-list">
          <button v-for="item in visibleModels" :key="item.key" type="button" role="option" :aria-selected="item.key === modelValue" :class="{ 'is-active': item.key === modelValue }" @click="choose(item.key)">
            <span class="model-catalog-picker__model-icon"><Bot :size="18" /></span>
            <span class="model-catalog-picker__model-copy">
              <span><strong>{{ item.displayName }}</strong><em v-if="item.badge">{{ item.badge }}</em></span>
              <small>{{ modelDescription(item) }}</small>
            </span>
            <span class="model-catalog-picker__model-meta">
              <small v-if="availabilityLabel(item)" :class="`is-${item.availability?.toLowerCase()}`">{{ availabilityLabel(item) }}</small>
              <b v-if="modelCost(item)"><Sparkles :size="11" />{{ modelCost(item) }}</b>
              <span class="model-catalog-picker__check" :class="{ 'is-visible': item.key === modelValue }" aria-hidden="true"><Check :size="15" /></span>
            </span>
          </button>
          <p v-if="!visibleModels.length">当前分类没有匹配的模型</p>
        </div>
      </div>
    </div>

    <div v-else class="model-catalog-picker__empty">
      <Search :size="22" />
      <strong>{{ models.length ? '没有找到匹配模型' : '暂无可用模型' }}</strong>
      <small>{{ models.length ? '换一个名称、厂商或模型 ID 试试' : '请联系管理员配置健康渠道，或添加个人 API 密钥' }}</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bot, Check, KeyRound, Search, Sparkles } from 'lucide-vue-next'
import { agentModelDescription, type CatalogModel } from '../utils/model-catalog'

const props = withDefaults(defineProps<{ models: CatalogModel[]; modelValue: string; title?: string; descriptionMode?: 'default' | 'agent' }>(), { title: '选择模型', descriptionMode: 'default' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; select: [value: string] }>()

const query = ref('')
const activeSource = ref('')
const activeVendor = ref('')

function sourceKey(item: CatalogModel) { return item.source === 'USER' ? 'USER' : 'PLATFORM' }
function sourceLabel(key: string) { return key === 'USER' ? '我的模型' : 'Xinyue AI' }
function inferredVendor(item: CatalogModel) {
  if (item.vendor?.name) return { key: item.vendor.key || item.vendor.name, label: item.vendor.name }
  const value = `${item.displayName} ${item.upstreamModel || ''}`.toLowerCase()
  if (/gpt|openai|o\d(?:-|$)/.test(value)) return { key: 'openai', label: 'OpenAI' }
  if (/deepseek/.test(value)) return { key: 'deepseek', label: 'DeepSeek' }
  if (/grok|xai/.test(value)) return { key: 'xai', label: 'xAI' }
  if (/claude|anthropic/.test(value)) return { key: 'anthropic', label: 'Anthropic' }
  if (/gemini/.test(value)) return { key: 'google', label: 'Google' }
  if (/qwen|通义|千问/.test(value)) return { key: 'qwen', label: '通义千问' }
  if (/doubao|豆包/.test(value)) return { key: 'doubao', label: '豆包' }
  const provider = item.provider?.name || item.provider?.type
  return { key: provider || 'other', label: provider || '其他模型' }
}

const matchingModels = computed(() => {
  const keyword = query.value.toLowerCase()
  if (!keyword) return props.models
  return props.models.filter((item) => {
    const vendor = inferredVendor(item).label
    return `${item.displayName} ${item.upstreamModel || ''} ${item.description || ''} ${vendor} ${sourceLabel(sourceKey(item))}`.toLowerCase().includes(keyword)
  })
})
const sourceGroups = computed(() => ['PLATFORM', 'USER'].map((key) => ({ key, label: sourceLabel(key), count: matchingModels.value.filter((item) => sourceKey(item) === key).length })).filter((item) => item.count))
const sourceModels = computed(() => matchingModels.value.filter((item) => sourceKey(item) === activeSource.value))
const vendorGroups = computed(() => {
  const groups = new Map<string, { key: string; label: string; initial: string; count: number }>()
  for (const item of sourceModels.value) {
    const vendor = inferredVendor(item)
    const current = groups.get(vendor.key)
    if (current) current.count += 1
    else groups.set(vendor.key, { ...vendor, initial: vendor.label.slice(0, 1).toUpperCase(), count: 1 })
  }
  return [...groups.values()]
})
const visibleModels = computed(() => sourceModels.value.filter((item) => inferredVendor(item).key === activeVendor.value))
const activeVendorLabel = computed(() => vendorGroups.value.find((item) => item.key === activeVendor.value)?.label || '当前')
const pickerHeight = computed(() => {
  const groups = new Map<string, number>()
  for (const item of matchingModels.value) {
    const key = `${sourceKey(item)}:${inferredVendor(item).key}`
    groups.set(key, (groups.get(key) || 0) + 1)
  }
  const largestGroup = Math.max(0, ...groups.values())
  return Math.min(460, Math.max(320, 116 + largestGroup * 62))
})

watch([matchingModels, () => props.modelValue], () => {
  const selected = matchingModels.value.find((item) => item.key === props.modelValue)
  const nextSource = selected ? sourceKey(selected) : sourceGroups.value.some((item) => item.key === activeSource.value) ? activeSource.value : sourceGroups.value[0]?.key || ''
  activeSource.value = nextSource
  const selectedVendor = selected && sourceKey(selected) === nextSource ? inferredVendor(selected).key : ''
  activeVendor.value = selectedVendor || vendorGroups.value.find((item) => item.key === activeVendor.value)?.key || vendorGroups.value[0]?.key || ''
}, { immediate: true })

function selectSource(value: string) {
  activeSource.value = value
  activeVendor.value = vendorGroups.value[0]?.key || ''
}
function modelCost(item: CatalogModel) { return item.effectiveCreditCost ?? item.flatCreditCost ?? 0 }
function modelDescription(item: CatalogModel) { return props.descriptionMode === 'agent' ? agentModelDescription(item) : item.description || item.upstreamModel || `${inferredVendor(item).label} 模型` }
function availabilityLabel(item: CatalogModel) {
  return item.availability === 'AVAILABLE' ? '可用' : item.availability === 'DEGRADED' ? '需检查' : '未配置'
}
function choose(value: string) {
  emit('update:modelValue', value)
  emit('select', value)
}
</script>

<style scoped>
.model-catalog-picker { --picker-accent: var(--studio-focus, #3876e8); --picker-border: var(--studio-border, #d9dce2); background: var(--studio-elevated, #fff); border: 1px solid var(--picker-border); border-radius: var(--studio-radius-md, 10px); box-shadow: var(--studio-shadow, 0 16px 42px rgba(21, 28, 38, .16)); box-sizing: border-box; color: var(--studio-text, #1d2026); height: min(var(--picker-content-height), calc(100dvh - 48px)); overflow: hidden; width: min(704px, calc(100vw - 24px)); }
.model-catalog-picker__header { align-items: center; border-bottom: 1px solid var(--picker-border); display: grid; gap: 20px; grid-template-columns: 164px minmax(240px, 1fr); min-height: 64px; padding: 10px 14px; }
.model-catalog-picker__heading { display: grid; gap: 2px; min-width: 0; }
.model-catalog-picker__heading strong { font-size: 14px; font-weight: 650; line-height: 20px; white-space: nowrap; }
.model-catalog-picker__heading small { color: var(--studio-muted, #878d98); font-size: 11px; line-height: 16px; white-space: nowrap; }
.model-catalog-picker__header label { align-items: center; background: var(--studio-control, #f5f6f8); border: 1px solid transparent; border-radius: 8px; color: var(--studio-muted, #878d98); display: flex; gap: 8px; height: 38px; padding: 0 11px; transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease; }
.model-catalog-picker__header label:focus-within { background: var(--studio-panel, #fff); border-color: color-mix(in srgb, var(--picker-accent) 62%, var(--picker-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--picker-accent) 12%, transparent); }
.model-catalog-picker__header input { background: transparent; border: 0; color: var(--studio-text, #1d2026); font: inherit; font-size: 13px; min-width: 0; outline: 0; width: 100%; }
.model-catalog-picker__header input::placeholder { color: var(--studio-muted, #9297a0); opacity: 1; }
.model-catalog-picker__body { display: grid; grid-template-columns: 156px 168px minmax(0, 1fr); height: calc(100% - 64px); min-height: 0; }
.model-catalog-picker__sources, .model-catalog-picker__vendors { border-right: 1px solid var(--picker-border); display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-y: auto; padding: 9px 8px 10px; scrollbar-width: none; }
.model-catalog-picker__sources::-webkit-scrollbar, .model-catalog-picker__vendors::-webkit-scrollbar { display: none; }
.model-catalog-picker button { color: inherit; font: inherit; }
.model-catalog-picker__column-title { color: var(--studio-muted, #8b9099); font-size: 10px; font-weight: 600; line-height: 18px; padding: 0 9px 4px; }
.model-catalog-picker__sources button, .model-catalog-picker__vendors button { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 7px; cursor: pointer; display: grid; gap: 8px; grid-template-columns: 28px minmax(0, 1fr) auto; min-height: 42px; padding: 5px 8px; position: relative; text-align: left; transition: background-color 120ms ease, border-color 120ms ease; width: 100%; }
.model-catalog-picker__sources button:hover, .model-catalog-picker__vendors button:hover { background: var(--studio-control, #f3f4f6); }
.model-catalog-picker__sources button.is-active, .model-catalog-picker__vendors button.is-active { background: color-mix(in srgb, var(--picker-accent) 8%, var(--studio-control, #f3f5f8)); border-color: color-mix(in srgb, var(--picker-accent) 16%, transparent); }
.model-catalog-picker__sources button.is-active::before, .model-catalog-picker__vendors button.is-active::before { background: var(--picker-accent); border-radius: 2px; content: ""; height: 18px; left: -1px; position: absolute; width: 2px; }
.model-catalog-picker__sources strong, .model-catalog-picker__vendors strong { font-size: 13px; font-weight: 570; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__sources small, .model-catalog-picker__vendors small { color: var(--studio-muted, #8b9099); font-size: 10px; font-variant-numeric: tabular-nums; }
.model-catalog-picker__source-icon, .model-catalog-picker__vendors button > span { align-items: center; background: var(--studio-panel, #fff); border: 1px solid var(--picker-border); border-radius: 7px; color: var(--studio-muted, #777d87); display: flex; height: 28px; justify-content: center; width: 28px; }
.model-catalog-picker__sources button.is-active .model-catalog-picker__source-icon, .model-catalog-picker__vendors button.is-active > span { border-color: color-mix(in srgb, var(--picker-accent) 28%, var(--picker-border)); color: var(--picker-accent); }
.model-catalog-picker__vendors button > span { font-size: 11px; font-weight: 700; }
.model-catalog-picker__models { display: grid; grid-template-rows: 40px minmax(0, 1fr); min-width: 0; overflow: hidden; }
.model-catalog-picker__models-heading { align-items: center; border-bottom: 1px solid color-mix(in srgb, var(--picker-border) 68%, transparent); display: flex; padding: 0 12px; }
.model-catalog-picker__models-heading > span { align-items: baseline; display: flex; gap: 7px; min-width: 0; }
.model-catalog-picker__models-heading strong { font-size: 12px; font-weight: 630; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__models-heading small { color: var(--studio-muted, #8a9099); font-size: 10px; white-space: nowrap; }
.model-catalog-picker__model-list { min-height: 0; overflow-y: auto; padding: 8px; scrollbar-color: color-mix(in srgb, var(--studio-muted, #8a9099) 36%, transparent) transparent; scrollbar-width: thin; }
.model-catalog-picker__model-list > button { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; display: grid; gap: 10px; grid-template-columns: 34px minmax(0, 1fr) auto; min-height: 60px; padding: 7px 9px; text-align: left; transition: background-color 120ms ease, border-color 120ms ease; width: 100%; }
.model-catalog-picker__model-list > button:hover { background: var(--studio-control, #f5f6f8); }
.model-catalog-picker__model-list > button.is-active { background: color-mix(in srgb, var(--picker-accent) 8%, var(--studio-control, #f5f7fb)); border-color: color-mix(in srgb, var(--picker-accent) 20%, transparent); }
.model-catalog-picker__model-icon { align-items: center; background: var(--studio-panel, #fff); border: 1px solid var(--picker-border); border-radius: 8px; color: var(--studio-muted, #757b85); display: flex; height: 34px; justify-content: center; width: 34px; }
.model-catalog-picker__model-list > button.is-active .model-catalog-picker__model-icon { border-color: color-mix(in srgb, var(--picker-accent) 26%, var(--picker-border)); color: var(--picker-accent); }
.model-catalog-picker__model-copy { display: grid; gap: 4px; min-width: 0; }
.model-catalog-picker__model-copy > span { align-items: center; display: flex; gap: 7px; min-width: 0; }
.model-catalog-picker__model-copy strong { font-size: 13px; font-weight: 630; line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__model-copy em { background: color-mix(in srgb, #e39122 11%, transparent); border-radius: 4px; color: #b66a06; flex: 0 0 auto; font-size: 9px; font-style: normal; line-height: 16px; padding: 0 5px; }
.model-catalog-picker__model-copy small { color: var(--studio-muted, #8a9099); font-size: 10px; line-height: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-catalog-picker__model-meta { align-items: center; display: flex; gap: 7px; }
.model-catalog-picker__model-meta b { align-items: center; color: var(--studio-muted, #777d87); display: flex; font-size: 11px; font-weight: 500; gap: 3px; }
.model-catalog-picker__model-meta small { background: color-mix(in srgb, #31945a 9%, transparent); border-radius: 4px; color: #237a43; font-size: 9px; line-height: 17px; padding: 0 5px; white-space: nowrap; }
.model-catalog-picker__model-meta small.is-degraded { color: #a25f00; }
.model-catalog-picker__model-meta small.is-unconfigured { color: #b64242; }
.model-catalog-picker__check { align-items: center; background: var(--picker-accent); border-radius: 50%; color: #fff; display: flex; height: 20px; justify-content: center; opacity: 0; transform: scale(.82); transition: opacity 120ms ease, transform 120ms ease; width: 20px; }
.model-catalog-picker__check.is-visible { opacity: 1; transform: scale(1); }
.model-catalog-picker__model-list > p, .model-catalog-picker__empty { color: var(--studio-muted, #858b95); }
.model-catalog-picker__model-list > p { font-size: 12px; padding: 28px 12px; text-align: center; }
.model-catalog-picker__empty { align-items: center; display: flex; flex-direction: column; gap: 7px; height: calc(100% - 58px); justify-content: center; padding: 24px; text-align: center; }
.model-catalog-picker__empty strong { color: var(--studio-text, #23262c); font-size: 14px; }
.model-catalog-picker__empty small { font-size: 12px; }
.model-catalog-picker button:focus-visible { outline: 2px solid color-mix(in srgb, var(--picker-accent) 68%, transparent); outline-offset: -2px; }
@media (max-width: 680px) {
  .model-catalog-picker { height: min(calc(var(--picker-content-height) + 100px), calc(100dvh - 24px)); }
  .model-catalog-picker__header { align-items: stretch; gap: 8px; grid-template-columns: 1fr; padding: 11px 12px; }
  .model-catalog-picker__heading small { display: none; }
  .model-catalog-picker__header label { height: 38px; }
  .model-catalog-picker__body { grid-template-columns: 1fr; grid-template-rows: auto auto minmax(0, 1fr); height: calc(100% - 84px); }
  .model-catalog-picker__sources, .model-catalog-picker__vendors { border-bottom: 1px solid var(--picker-border); border-right: 0; flex-direction: row; overflow-x: auto; overflow-y: hidden; padding: 7px 8px; }
  .model-catalog-picker__column-title { align-items: center; display: flex; flex: 0 0 auto; padding: 0 4px; }
  .model-catalog-picker__sources button, .model-catalog-picker__vendors button { flex: 0 0 auto; min-width: 132px; }
  .model-catalog-picker__models { grid-template-rows: 38px minmax(0, 1fr); }
  .model-catalog-picker__model-list > button { min-height: 64px; padding-inline: 8px; }
  .model-catalog-picker__model-meta { gap: 5px; }
  .model-catalog-picker__model-meta b { display: none; }
}
@media (prefers-reduced-motion: reduce) { .model-catalog-picker * { scroll-behavior: auto !important; } }
</style>
