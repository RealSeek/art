<template>
  <div class="plugin-selector" :class="{ 'plugin-selector--compact': compact }">
    <button type="button" :class="{ 'is-active': modelValue }" :aria-expanded="open" :aria-label="`选择插件，当前为${selected?.name || '未启用'}`" @click="toggle">
      <Blocks :size="15" /><span>{{ selected?.name || '插件' }}</span><ChevronDown :size="13" />
    </button>
    <div v-if="open" class="plugin-selector__popover">
      <header><span><strong>选择插件</strong><small>只显示支持当前任务的已安装或私有插件</small></span><RouterLink to="/plugins" @click="open = false">管理</RouterLink></header>
      <button type="button" :class="{ 'is-active': !modelValue }" @click="select('')"><span><strong>不使用插件</strong><small>按当前模型和设置直接生成</small></span><Check v-if="!modelValue" :size="15" /></button>
      <button v-for="plugin in plugins" :key="plugin.id" type="button" :class="{ 'is-active': modelValue === plugin.id }" @click="select(plugin.id)">
        <span><strong>{{ plugin.name }}<em v-if="plugin.owned">私有</em></strong><small>{{ plugin.description || capabilityLabel }}</small></span><Check v-if="modelValue === plugin.id" :size="15" />
      </button>
      <p v-if="loading">正在读取可用插件</p>
      <p v-else-if="!plugins.length">暂无可用插件，可前往插件市场安装</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Blocks, Check, ChevronDown } from 'lucide-vue-next'
import { api } from '../services/api'
import type { Plugin, PluginCapability } from '../types'

const props = withDefaults(defineProps<{ modelValue?: string; capability: PluginCapability; compact?: boolean }>(), { modelValue: '', compact: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const plugins = ref<Plugin[]>([])
const loading = ref(false)
const open = ref(false)
const selected = computed(() => plugins.value.find((plugin) => plugin.id === props.modelValue))
const capabilityLabel = computed(() => ({ CHAT: '对话插件', IMAGE: '图片插件', VIDEO: '视频插件', COMMERCE: '电商插件', OFFICE: '办公插件' }[props.capability]))

async function load() {
  loading.value = true
  try {
    plugins.value = await api<Plugin[]>(`/plugins/available?capability=${props.capability}`)
    if (props.modelValue && !plugins.value.some((plugin) => plugin.id === props.modelValue)) emit('update:modelValue', '')
  } catch { plugins.value = []; if (props.modelValue) emit('update:modelValue', '') }
  finally { loading.value = false }
}
function select(id: string) { emit('update:modelValue', id); open.value = false }
function toggle() { open.value = !open.value; if (open.value) void load() }
function close() { open.value = false }
watch(() => props.capability, () => { void load() })
onMounted(() => { void load(); document.addEventListener('xinyue:close-popovers', close) })
onUnmounted(() => document.removeEventListener('xinyue:close-popovers', close))
</script>
