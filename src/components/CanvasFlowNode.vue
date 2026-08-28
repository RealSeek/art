<template>
  <article class="canvas-flow-node" :class="[`is-${data.kind.toLowerCase()}`, { 'is-selected': selected }]" @contextmenu.prevent="emit('context', $event)">
    <NodeResizer
      :is-visible="selected"
      :min-width="data.kind === 'GROUP' ? 280 : 180"
      :min-height="data.kind === 'GROUP' ? 220 : 120"
      :max-width="1600"
      :max-height="1200"
      color="#4d6bfe"
      @resize-start="emit('checkpoint')"
      @resize-end="handleResizeEnd"
    />
    <div class="canvas-node-hover-toolbar nodrag" @mousedown.stop @pointerdown.stop>
      <button type="button" title="查看节点信息与参数" aria-label="查看节点信息与参数" @click="emit('configure')"><Settings2 :size="14" /></button>
      <button v-if="data.kind === 'IMAGE' || data.kind === 'VIDEO' || data.kind === 'AUDIO'" type="button" title="选择或替换素材" aria-label="选择或替换素材" @click="emit('pick')"><Upload :size="14" /></button>
      <button v-if="data.kind === 'TEXT' || data.kind === 'CONFIG'" type="button" title="从文本创建图片" aria-label="从文本创建图片" @click="emit('derive', 'IMAGE')"><ImagePlus :size="14" /></button>
      <button v-if="data.kind === 'TEXT' || data.kind === 'CONFIG' || data.kind === 'IMAGE'" type="button" title="创建视频节点" aria-label="创建视频节点" @click="emit('derive', 'VIDEO')"><Clapperboard :size="14" /></button>
      <button v-if="data.kind === 'IMAGE'" type="button" title="继续派生图片" aria-label="继续派生图片" @click="emit('derive', 'IMAGE')"><GitBranchPlus :size="14" /></button>
      <button v-if="data.kind === 'IMAGE' && data.assetId" type="button" title="裁剪与蒙版编辑" aria-label="裁剪与蒙版编辑" @click="emit('edit')"><Crop :size="14" /></button>
      <button type="button" title="复制节点" aria-label="复制节点" @click="emit('duplicate')"><Copy :size="14" /></button>
      <button v-if="data.url" type="button" title="下载素材" aria-label="下载素材" @click="emit('download')"><Download :size="14" /></button>
      <button type="button" title="删除节点" aria-label="删除节点" @click="emit('remove')"><Trash2 :size="14" /></button>
    </div>
    <Handle type="target" :position="Position.Left" class="canvas-node-handle" />

    <header class="canvas-node-header">
      <div class="canvas-node-heading">
        <span class="canvas-node-kind"><component :is="nodeIcon" :size="15" />{{ kindLabel }}</span>
        <strong class="canvas-node-title">{{ data.title }}</strong>
      </div>
    </header>

    <div class="canvas-node-body nowheel" :class="{ nodrag: data.kind === 'TEXT' }">
      <textarea
        v-if="data.kind === 'TEXT'"
        :value="data.content"
        aria-label="文本节点内容"
        placeholder="输入提示词、脚本或说明..."
        @focus="emit('checkpoint')"
        @input="updateContent"
      />
      <template v-else-if="data.kind === 'IMAGE'">
        <img v-if="data.url" :src="data.url" :alt="data.title" draggable="false" />
        <button v-else class="canvas-node-empty" type="button" @click="emit('pick')"><ImageIcon :size="28" /><span>空图片节点</span><small>点击选择图片或开始生成</small></button>
      </template>
      <template v-else-if="data.kind === 'VIDEO'">
        <video v-if="data.url" class="nodrag" :src="data.url" controls playsinline />
        <button v-else class="canvas-node-empty" type="button" @click="emit('pick')"><Video :size="28" /><span>选择视频或开始生成</span><small>支持 MP4、WebM 与 MOV</small></button>
      </template>
      <template v-else-if="data.kind === 'AUDIO'">
        <audio v-if="data.url" class="nodrag" :src="data.url" controls preload="metadata" />
        <button v-else class="canvas-node-empty" type="button" @click="emit('pick')"><Music2 :size="28" /><span>选择音频</span><small>支持 MP3、WAV、M4A 与 OGG</small></button>
      </template>
      <div v-else-if="data.kind === 'CONFIG'" class="canvas-node-config">
        <Sparkles :size="20" />
        <span>{{ data.model || '跟随工作区模型' }}</span>
        <small>{{ data.prompt || '连接提示词和参考节点后开始生成' }}</small>
      </div>
      <div v-else class="canvas-node-group-label"><Layers3 :size="22" /><span>将相关节点放在这个区域内</span></div>

      <div v-if="data.status === 'QUEUED' || data.status === 'RUNNING'" class="canvas-node-job-state nodrag">
        <LoaderCircle class="canvas-spin" :size="20" />
        <strong>{{ data.status === 'QUEUED' ? '等待生成' : '正在生成' }}</strong>
        <button type="button" @click="emit('cancel')">取消任务</button>
      </div>
      <div v-else-if="data.status === 'FAILED' || data.status === 'CANCELLED'" class="canvas-node-job-state is-error nodrag">
        <CircleAlert :size="20" />
        <strong>{{ data.status === 'CANCELLED' ? '任务已取消' : '生成失败' }}</strong>
        <small>{{ data.error || '请检查模型与输入后重试' }}</small>
        <button type="button" @click="emit('retry')"><RefreshCw :size="13" />重新生成</button>
      </div>
    </div>

    <div v-if="selected && (data.kind === 'IMAGE' || data.kind === 'VIDEO')" class="canvas-node-prompt-composer nodrag nowheel" @mousedown.stop @pointerdown.stop>
      <textarea :value="data.prompt || ''" rows="3" :placeholder="data.kind === 'IMAGE' ? '描述要生成的图片内容' : '描述要生成的视频内容'" aria-label="生成提示词" @focus="emit('checkpoint')" @input="updatePrompt" />
      <div class="canvas-node-prompt-actions">
        <label class="canvas-node-model-select" data-canvas-no-zoom>
          <select :value="selectedModel" :disabled="!modelOptions.length" aria-label="选择生成模型" @change="updateModel">
            <option v-if="!modelOptions.length" value="">暂无可用模型</option>
            <option v-for="model in modelOptions" :key="model.key" :value="model.key">{{ model.displayName }}</option>
          </select>
        </label>
        <span class="canvas-node-generation-summary"><SlidersHorizontal :size="14" />{{ generationSummary || (data.kind === 'IMAGE' ? '1:1 · 智能' : '视频 · 5 秒') }}</span>
        <button type="button" class="canvas-node-settings-button" title="打开完整参数" aria-label="打开完整参数" @click="emit('configure')"><Settings2 :size="14" /></button>
        <button type="button" :disabled="data.status === 'QUEUED' || data.status === 'RUNNING'" title="开始生成" aria-label="开始生成" @click="emit('run')"><Sparkles :size="15" /><span>生成</span></button>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="canvas-node-handle" />
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer, type OnResizeStart } from '@vue-flow/node-resizer'
import { Clapperboard, CircleAlert, Copy, Crop, Download, FileText, GitBranchPlus, Image as ImageIcon, ImagePlus, Layers3, LoaderCircle, Music2, RefreshCw, Settings2, SlidersHorizontal, Sparkles, Trash2, Upload, Video } from 'lucide-vue-next'
import type { CanvasNodeData } from '../types/canvas'

const props = defineProps<{ data: CanvasNodeData; selected?: boolean; modelOptions?: Array<{ key: string; displayName: string }>; generationSummary?: string }>()
const emit = defineEmits<{
  update: [patch: Partial<CanvasNodeData>]
  remove: []
  duplicate: []
  checkpoint: []
  resize: [size: { width: number; height: number }]
  pick: []
  cancel: []
  retry: []
  context: [event: MouseEvent]
  configure: []
  derive: [kind: 'IMAGE' | 'VIDEO']
  run: []
  download: []
  edit: []
}>()

const kindLabel = computed(() => ({ TEXT: '文本', IMAGE: '图片', VIDEO: '视频', AUDIO: '音频', GROUP: '分组', CONFIG: '生成设置' })[props.data.kind])
const nodeIcon = computed(() => ({ TEXT: FileText, IMAGE: ImageIcon, VIDEO: Video, AUDIO: Music2, GROUP: Layers3, CONFIG: Settings2 })[props.data.kind])
const modelOptions = computed(() => props.modelOptions || [])
const generationSummary = computed(() => props.generationSummary || '')
const selectedModel = computed(() => props.data.model || modelOptions.value[0]?.key || '')

function updateContent(event: Event) {
  emit('update', { content: (event.target as HTMLTextAreaElement).value })
}

function updatePrompt(event: Event) {
  emit('update', { prompt: (event.target as HTMLTextAreaElement).value })
}

function updateModel(event: Event) {
  emit('update', { model: (event.target as HTMLSelectElement).value, generationOptions: {} })
}

function handleResizeEnd(event: OnResizeStart) {
  emit('resize', { width: event.params.width, height: event.params.height })
}
</script>
