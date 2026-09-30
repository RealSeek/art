<template>
  <div class="region-editor-layer" @mousedown.self="emit('close')">
    <section class="region-editor" role="dialog" aria-modal="true" aria-labelledby="region-editor-title" :aria-busy="loading || saving">
      <header class="region-editor__header">
        <div>
          <h2 id="region-editor-title">选择要编辑的区域</h2>
          <p>支持画笔、矩形、圆形，多次叠加选区</p>
        </div>
      </header>

      <div class="region-editor__toolbar">
        <label>画笔<input v-model.number="brushSize" type="range" :min="minBrushSize" :max="maxBrushSize" step="1" /><output>{{ brushSize }}</output></label>
        <label>软边<input v-model.number="softness" type="range" min="0" max="100" step="5" /><output>{{ softness }}%</output></label>
        <div class="region-editor__tools" role="group" aria-label="选区工具">
          <button type="button" :class="{ 'is-active': tool === 'brush' }" :aria-pressed="tool === 'brush'" aria-label="画笔" title="画笔" @click="tool = 'brush'"><Paintbrush :size="17" /></button>
          <button type="button" :class="{ 'is-active': tool === 'eraser' }" :aria-pressed="tool === 'eraser'" aria-label="橡皮" title="橡皮" @click="tool = 'eraser'"><Eraser :size="17" /></button>
          <button type="button" :class="{ 'is-active': tool === 'rect' }" :aria-pressed="tool === 'rect'" aria-label="矩形选区" title="矩形选区" @click="tool = 'rect'"><Square :size="17" /></button>
          <button type="button" :class="{ 'is-active': tool === 'ellipse' }" :aria-pressed="tool === 'ellipse'" aria-label="圆形选区" title="圆形选区" @click="tool = 'ellipse'"><Circle :size="17" /></button>
          <button type="button" :class="{ 'is-active': tool === 'hand' }" :aria-pressed="tool === 'hand'" aria-label="平移画面" title="平移画面" @click="tool = 'hand'"><Hand :size="17" /></button>
        </div>
      </div>

      <div class="region-editor__actions">
        <button type="button" :disabled="historyIndex === 0" aria-label="撤销" title="撤销" @click="undo"><Undo2 :size="17" /></button>
        <button type="button" :disabled="historyIndex >= snapshots.length - 1" aria-label="重做" title="重做" @click="redo"><Redo2 :size="17" /></button>
        <button type="button" :disabled="!snapshots[historyIndex].length" aria-label="清空选区" title="清空选区" @click="clearSelection"><Trash2 :size="17" /></button>
        <i class="region-editor__divider" aria-hidden="true" />
        <button type="button" aria-label="缩小" title="缩小" @click="zoomBy(1 / 1.25)"><ZoomOut :size="17" /></button>
        <button type="button" class="region-editor__zoom" aria-label="重置缩放" title="重置缩放" @click="resetZoom">{{ Math.round(zoom * 100) }}%</button>
        <button type="button" aria-label="放大" title="放大" @click="zoomBy(1.25)"><ZoomIn :size="17" /></button>
        <button type="button" aria-label="适应窗口" title="适应窗口" @click="fitToStage"><Maximize :size="17" /></button>
        <i class="region-editor__divider" aria-hidden="true" />
        <button type="button" @click="emit('close')">取消</button>
        <button class="is-primary" type="button" :disabled="!hasSelection || loading || saving || Boolean(error) || busy" @click="applyMask">
          <LoaderCircle v-if="saving || busy" class="region-editor__spin" :size="16" />
          {{ saving || busy ? '正在应用' : '应用区域' }}
        </button>
      </div>

      <div
        ref="stage"
        class="region-editor__stage"
        :class="{ 'is-hand': tool === 'hand', 'is-drawing': drawing }"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endGesture"
        @pointercancel="endGesture"
        @pointerleave="endGesture"
      >
        <div v-if="loading" class="region-editor__status"><LoaderCircle class="region-editor__spin" :size="18" />正在读取原图</div>
        <div v-else-if="error" class="region-editor__status is-error" role="alert">{{ error }}</div>
        <div v-show="!loading && !error" class="region-editor__surface" :style="surfaceStyle">
          <img ref="imageElement" :src="objectUrl" alt="待编辑图片" draggable="false" @load="prepareImage" />
          <canvas ref="overlayCanvas" class="region-editor__overlay" />
          <canvas ref="maskCanvas" class="region-editor__mask" />
        </div>
      </div>

      <footer class="region-editor__footer">
        <span aria-hidden="true">预览说明</span>
        黑色区域=编辑区域，绿色区域=擦除已选区域；支持多选区、撤销重做、缩放平移。
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Circle, Eraser, Hand, LoaderCircle, Maximize, Paintbrush, Redo2, Square, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { apiUrl } from '../services/api'
import { writeMaskPixels, type MaskFormat } from '../utils/mask-image'

type RegionTool = 'brush' | 'eraser' | 'rect' | 'ellipse' | 'hand'
type Point = { x: number; y: number }
type BrushAction = { kind: 'brush'; erase: boolean; size: number; softness: number; points: Point[] }
type ShapeAction = { kind: 'shape'; tool: 'rect' | 'ellipse'; from: Point; to: Point }
type RegionAction = BrushAction | ShapeAction

const props = defineProps<{ src: string; maskFormat: MaskFormat; busy?: boolean }>()
const emit = defineEmits<{ close: []; apply: [payload: { blob: Blob; name: string; width: number; height: number }] }>()

const stage = ref<HTMLDivElement | null>(null)
const imageElement = ref<HTMLImageElement | null>(null)
const maskCanvas = ref<HTMLCanvasElement | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const objectUrl = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const imageReady = ref(false)
const naturalWidth = ref(1)
const naturalHeight = ref(1)
const stageSize = ref({ width: 900, height: 520 })
const tool = ref<RegionTool>('brush')
const brushSize = ref(48)
const softness = ref(20)
const zoom = ref(1)
const offset = ref<Point>({ x: 0, y: 0 })
const actions = ref<RegionAction[]>([])
const snapshots = ref<RegionAction[][]>([[]])
const historyIndex = ref(0)
const draft = ref<RegionAction | null>(null)
const drawing = ref(false)

const minBrushSize = computed(() => Math.max(2, Math.round(Math.max(naturalWidth.value, naturalHeight.value) / 200)))
const maxBrushSize = computed(() => Math.max(minBrushSize.value + 8, Math.round(Math.max(naturalWidth.value, naturalHeight.value) / 3)))
/** 只要存在涂抹或形状选区就允许应用；橡皮单独使用时不会产生选区。 */
const hasSelection = computed(() => snapshots.value[historyIndex.value].some((action) => action.kind === 'shape' || !action.erase))
const surfaceStyle = computed(() => ({
  width: `${naturalWidth.value}px`,
  height: `${naturalHeight.value}px`,
  transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${zoom.value})`,
}))

let panStart: { pointer: Point; offset: Point } | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  void loadSource()
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    stageSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
    if (imageReady.value) fitToStage()
  })
  resizeObserver.observe(stage.value as HTMLDivElement)
  window.addEventListener('keydown', onKeydown)
  document.body.classList.add('has-region-editor')
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('has-region-editor')
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})

async function loadSource() {
  try {
    const response = await fetch(apiUrl(props.src), { credentials: 'include' })
    if (!response.ok) throw new Error(`原图读取失败 (${response.status})`)
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) throw new Error('当前文件不是可编辑图片')
    objectUrl.value = URL.createObjectURL(blob)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法读取原图'
  } finally {
    loading.value = false
  }
}

function prepareImage() {
  const image = imageElement.value
  if (!image) return
  naturalWidth.value = image.naturalWidth || 1
  naturalHeight.value = image.naturalHeight || 1
  brushSize.value = Math.min(maxBrushSize.value, Math.max(minBrushSize.value, Math.round(Math.max(naturalWidth.value, naturalHeight.value) / 12)))
  imageReady.value = true
  fitToStage()
  renderSelection()
}

function fitToStage() {
  if (!imageReady.value) return
  const width = Math.max(64, stageSize.value.width - 48)
  const height = Math.max(64, stageSize.value.height - 48)
  zoom.value = Math.max(0.05, Math.min(width / naturalWidth.value, height / naturalHeight.value, 1))
  offset.value = { x: 0, y: 0 }
}

function zoomBy(factor: number) {
  zoom.value = Math.min(8, Math.max(0.05, zoom.value * factor))
}

function resetZoom() {
  zoom.value = 1
  offset.value = { x: 0, y: 0 }
}

function onWheel(event: WheelEvent) {
  const rect = surfaceRect()
  if (!rect) return
  const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  const next = Math.min(8, Math.max(0.05, zoom.value * (event.deltaY < 0 ? 1.12 : 1 / 1.12)))
  const ratio = next / zoom.value
  offset.value = { x: offset.value.x - pointer.x * (ratio - 1), y: offset.value.y - pointer.y * (ratio - 1) }
  zoom.value = next
}

function surfaceRect() {
  return maskCanvas.value?.parentElement?.getBoundingClientRect() || null
}

function toImagePoint(event: PointerEvent): Point {
  const rect = surfaceRect()
  if (!rect) return { x: 0, y: 0 }
  return { x: (event.clientX - rect.left) / zoom.value, y: (event.clientY - rect.top) / zoom.value }
}

function onPointerDown(event: PointerEvent) {
  if (loading.value || error.value || !imageReady.value) return
  event.preventDefault()
  if (tool.value === 'hand' || event.button === 1) {
    panStart = { pointer: { x: event.clientX, y: event.clientY }, offset: { ...offset.value } }
    drawing.value = true
    return
  }
  const point = toImagePoint(event)
  drawing.value = true
  draft.value = tool.value === 'rect' || tool.value === 'ellipse'
    ? { kind: 'shape', tool: tool.value, from: point, to: point }
    : { kind: 'brush', erase: tool.value === 'eraser', size: brushSize.value, softness: softness.value, points: [point] }
  renderSelection()
}

function onPointerMove(event: PointerEvent) {
  if (!drawing.value) return
  if (panStart) {
    offset.value = { x: panStart.offset.x + (event.clientX - panStart.pointer.x), y: panStart.offset.y + (event.clientY - panStart.pointer.y) }
    return
  }
  const active = draft.value
  if (!active) return
  const point = toImagePoint(event)
  if (active.kind === 'shape') active.to = point
  else active.points.push(point)
  renderSelection()
}

function endGesture() {
  if (!drawing.value) return
  drawing.value = false
  panStart = null
  const active = draft.value
  draft.value = null
  if (!active) return
  if (active.kind === 'shape' && (Math.abs(active.to.x - active.from.x) < 2 || Math.abs(active.to.y - active.from.y) < 2)) {
    renderSelection()
    return
  }
  actions.value = [...actions.value, active]
  pushSnapshot()
}

function pushSnapshot() {
  snapshots.value = [...snapshots.value.slice(0, historyIndex.value + 1), [...actions.value]]
  historyIndex.value = snapshots.value.length - 1
  renderSelection()
}

function undo() {
  if (historyIndex.value === 0) return
  historyIndex.value -= 1
  actions.value = [...snapshots.value[historyIndex.value]]
  renderSelection()
}

function redo() {
  if (historyIndex.value >= snapshots.value.length - 1) return
  historyIndex.value += 1
  actions.value = [...snapshots.value[historyIndex.value]]
  renderSelection()
}

function clearSelection() {
  if (!actions.value.length) return
  actions.value = []
  pushSnapshot()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { emit('close'); return }
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
  event.preventDefault()
  if (event.shiftKey) redo()
  else undo()
}

function renderSelection() {
  const mask = maskCanvas.value
  const overlay = overlayCanvas.value
  if (!mask || !overlay) return
  const maskContext = mask.getContext('2d')
  const overlayContext = overlay.getContext('2d')
  if (!maskContext || !overlayContext) return
  if (mask.width !== naturalWidth.value || mask.height !== naturalHeight.value) {
    mask.width = naturalWidth.value
    mask.height = naturalHeight.value
  }
  if (overlay.width !== naturalWidth.value || overlay.height !== naturalHeight.value) {
    overlay.width = naturalWidth.value
    overlay.height = naturalHeight.value
  }
  maskContext.clearRect(0, 0, mask.width, mask.height)
  overlayContext.clearRect(0, 0, overlay.width, overlay.height)
  const list = draft.value ? [...actions.value, draft.value] : actions.value
  for (const action of list) paintAction(maskContext, overlayContext, action)
}

function paintAction(maskContext: CanvasRenderingContext2D, overlayContext: CanvasRenderingContext2D, action: RegionAction) {
  if (action.kind === 'brush') {
    const erase = action.erase
    const radius = Math.max(1, action.size / 2)
    const inner = 1 - Math.min(1, Math.max(0, action.softness) / 100)
    const stamp = (context: CanvasRenderingContext2D, from: string, to: string, center: Point) => {
      const gradient = context.createRadialGradient(center.x, center.y, radius * Math.min(0.98, inner), center.x, center.y, radius)
      gradient.addColorStop(0, from)
      gradient.addColorStop(1, to)
      context.fillStyle = gradient
      context.beginPath()
      context.arc(center.x, center.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    const step = Math.max(1, radius * 0.28)
    const points: Point[] = []
    for (const [index, point] of action.points.entries()) {
      if (index === 0) { points.push(point); continue }
      const previous = action.points[index - 1]
      const segments = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / step))
      for (let segment = 1; segment <= segments; segment += 1) {
        points.push({ x: previous.x + (point.x - previous.x) * segment / segments, y: previous.y + (point.y - previous.y) * segment / segments })
      }
    }
    maskContext.save()
    maskContext.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    for (const point of points) stamp(maskContext, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', point)
    maskContext.restore()
    for (const point of points) stamp(overlayContext, erase ? 'rgba(34,197,94,.6)' : 'rgba(0,0,0,.6)', erase ? 'rgba(34,197,94,0)' : 'rgba(0,0,0,0)', point)
    return
  }
  const left = Math.min(action.from.x, action.to.x)
  const top = Math.min(action.from.y, action.to.y)
  const width = Math.abs(action.to.x - action.from.x)
  const height = Math.abs(action.to.y - action.from.y)
  maskContext.save()
  maskContext.globalCompositeOperation = 'source-over'
  maskContext.fillStyle = 'rgba(255,255,255,1)'
  maskContext.beginPath()
  if (action.tool === 'ellipse') maskContext.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
  else maskContext.rect(left, top, width, height)
  maskContext.fill()
  maskContext.restore()
  overlayContext.fillStyle = 'rgba(0,0,0,.6)'
  overlayContext.beginPath()
  if (action.tool === 'ellipse') overlayContext.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
  else overlayContext.rect(left, top, width, height)
  overlayContext.fill()
}

async function applyMask() {
  const mask = maskCanvas.value
  const context = mask?.getContext('2d')
  if (!mask || !context) return
  saving.value = true
  error.value = ''
  try {
    const source = context.getImageData(0, 0, mask.width, mask.height)
    const output = document.createElement('canvas')
    output.width = mask.width
    output.height = mask.height
    const outputContext = output.getContext('2d')
    if (!outputContext) throw new Error('浏览器无法创建蒙版画布')
    const imageData = outputContext.createImageData(mask.width, mask.height)
    imageData.data.set(writeMaskPixels(source.data, props.maskFormat))
    outputContext.putImageData(imageData, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => output.toBlob((result) => result ? resolve(result) : reject(new Error('浏览器无法导出蒙版')), 'image/png'))
    emit('apply', { blob, name: `region-mask-${Date.now()}.png`, width: mask.width, height: mask.height })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '蒙版导出失败'
  } finally {
    saving.value = false
  }
}
</script>
