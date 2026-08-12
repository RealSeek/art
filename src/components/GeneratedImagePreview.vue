<template>
  <Teleport to="body">
    <div class="asset-preview-layer" :class="{ 'asset-preview-layer--video': isVideo }" @mousedown.self="emit('close')">
      <section class="asset-preview-dialog generated-image-preview" :class="{ 'generated-video-preview': isVideo }" role="dialog" aria-modal="true" :aria-label="`${asset.title}预览`">
        <header><span><strong>{{ asset.title }}</strong><small>{{ isVideo ? `视频 · ${Math.round(view.scale * 100)}%` : `${Math.round(view.scale * 100)}%` }}</small></span><nav><button type="button" aria-label="关闭预览" title="关闭" @click="emit('close')"><X :size="20" /></button></nav></header>
        <div ref="viewport" class="asset-preview-viewport" :class="{ 'is-panning': dragging, 'is-zoomed': view.scale > 1.001, 'asset-preview-viewport--video': isVideo }" @wheel="handlePreviewWheel" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan">
          <div class="asset-preview-canvas" :class="isVideo ? 'asset-preview-canvas--video' : 'asset-preview-canvas--image'" :style="canvasStyle">
            <div v-if="isVideo" class="asset-preview-video-frame" :style="videoFrameStyle">
              <video :src="asset.contentUrl" controls autoplay playsinline preload="metadata" disablepictureinpicture disableremoteplayback controlslist="nodownload noplaybackrate" :aria-label="asset.title" @loadedmetadata="syncVideoRatio" />
              <div v-if="dragMode" class="asset-preview-video-drag-surface" aria-label="拖拽移动视频" />
            </div>
            <img v-else :src="asset.contentUrl" :alt="asset.title" draggable="false" />
          </div>
        </div>
        <div class="asset-preview-toolbar" :class="{ 'asset-preview-toolbar--video': isVideo }" aria-label="预览工具">
          <button v-if="isVideo" type="button" :class="{ 'is-active': dragMode }" :aria-pressed="dragMode" :aria-label="dragMode ? '切换到视频操作模式' : '切换到拖动模式'" :title="dragMode ? '操作视频' : '拖动画面'" @click="toggleDragMode"><Hand v-if="dragMode" :size="18" /><MousePointer2 v-else :size="18" /></button>
          <button type="button" aria-label="缩小" title="缩小" @click="zoomBy(-0.2)"><ZoomOut :size="18" /></button>
          <button type="button" aria-label="适配画布" title="适配画布" @click="resetView"><Maximize2 :size="18" /></button>
          <button type="button" aria-label="放大" title="放大" @click="zoomBy(0.2)"><ZoomIn :size="18" /></button>
          <button v-if="asset.jobId" type="button" aria-label="重新生成" title="重新生成" @click="emit('regenerate'); emit('close')"><RefreshCw :size="18" /></button>
          <button v-if="!isVideo" type="button" aria-label="用作参考" title="用作参考" @click="emit('reuse'); emit('close')"><ImagePlus :size="18" /></button>
          <button v-if="asset.prompt" type="button" aria-label="引用提示词" title="引用提示词" @click="emit('quote'); emit('close')"><Quote :size="18" /></button>
          <button type="button" :aria-label="isVideo ? '下载视频' : '下载图片'" :title="isVideo ? '下载视频' : '下载图片'" @click="emit('download')"><Download :size="18" /></button>
          <button class="danger" type="button" :aria-label="isVideo ? '删除视频' : '删除图片'" :title="isVideo ? '删除视频' : '删除图片'" @click="removeAsset"><Trash2 :size="18" /></button>
        </div>
        <footer><p>{{ asset.prompt || (isVideo ? 'Xinyue AI 生成视频' : 'Xinyue AI 生成图片') }}</p></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { Download, Hand, ImagePlus, Maximize2, MousePointer2, Quote, RefreshCw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import type { StudioAsset } from '../types'

const props = defineProps<{ asset: StudioAsset }>()
const emit = defineEmits<{ close: []; delete: []; download: []; reuse: []; quote: []; regenerate: [] }>()
const isVideo = computed(() => props.asset.kind === 'video' || Boolean(props.asset.mimeType?.startsWith('video/')))
const viewport = ref<HTMLElement | null>(null)
const dragging = ref(false)
const dragMode = ref(false)
const view = reactive({ scale: 1, x: 0, y: 0 })
const videoRatio = ref(16 / 9)
const pointer = reactive({ id: -1, x: 0, y: 0 })
const canvasStyle = computed(() => ({ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }))
const videoFrameStyle = computed(() => ({ aspectRatio: String(videoRatio.value) }))
function resetView() { view.scale = 1; view.x = 0; view.y = 0; dragging.value = false; pointer.id = -1 }
function toggleDragMode() { dragMode.value = !dragMode.value; dragging.value = false; pointer.id = -1 }
function syncVideoRatio(event: Event) {
  const video = event.currentTarget as HTMLVideoElement
  if (video.videoWidth && video.videoHeight) videoRatio.value = video.videoWidth / video.videoHeight
}
function zoomAt(value: number, clientX?: number, clientY?: number) {
  const element = viewport.value
  const next = Math.min(5, Math.max(.3, value))
  if (!element || next === view.scale) return
  const rect = element.getBoundingClientRect()
  const x = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2
  const y = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2
  const ratio = next / view.scale
  view.x = x - (x - view.x) * ratio; view.y = y - (y - view.y) * ratio; view.scale = next
}
function zoomBy(delta: number) { zoomAt(view.scale + delta) }
function handleWheel(event: WheelEvent) { zoomAt(view.scale * (event.deltaY < 0 ? 1.12 : .89), event.clientX, event.clientY) }
function handlePreviewWheel(event: WheelEvent) { event.preventDefault(); handleWheel(event) }
function startPan(event: PointerEvent) {
  if (event.button !== 0) return
  if (isVideo.value && !(event.target instanceof HTMLElement && event.target.classList.contains('asset-preview-video-drag-surface'))) return
  pointer.id = event.pointerId; pointer.x = event.clientX; pointer.y = event.clientY
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function movePan(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== pointer.id) return
  view.x += event.clientX - pointer.x; view.y += event.clientY - pointer.y; pointer.x = event.clientX; pointer.y = event.clientY
}
function endPan(event: PointerEvent) { if (event.pointerId !== pointer.id) return; dragging.value = false; pointer.id = -1 }
function removeAsset() { if (!window.confirm(`确认删除“${props.asset.title}”？`)) return; emit('delete'); emit('close') }
function handleKeydown(event: KeyboardEvent) { if (event.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>
