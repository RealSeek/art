<template>
  <div class="canvas-modal-backdrop canvas-image-editor-backdrop" role="presentation" @mousedown.self="emit('close')">
    <section class="canvas-image-editor" role="dialog" aria-modal="true" :aria-labelledby="`${dialogId}-title`">
      <header>
        <div>
          <span>图片编辑</span>
          <h2 :id="`${dialogId}-title`">裁剪图片</h2>
        </div>
        <button type="button" aria-label="关闭图片编辑器" @click="emit('close')"><X :size="19" /></button>
      </header>

      <div v-if="loading" class="canvas-image-editor-loading"><LoaderCircle class="canvas-spin" :size="22" />正在读取原图</div>
      <div v-else-if="error" class="canvas-image-editor-error"><CircleAlert :size="20" /><span>{{ error }}</span></div>
      <template v-else>
        <div class="canvas-crop-toolbar" aria-label="裁剪比例">
          <button v-for="preset in cropPresets" :key="preset.value" type="button" :class="{ 'is-active': cropRatio === preset.value }" @click="setCropRatio(preset.value)">{{ preset.label }}</button>
        </div>

        <div ref="stage" class="canvas-image-editor-stage is-crop">
          <div class="canvas-image-editor-media" :style="mediaStyle">
            <img ref="imageElement" :src="objectUrl" alt="待编辑图片" draggable="false" @load="prepareImage" />
            <template v-if="imageReady">
              <div class="canvas-crop-shade is-top" :style="cropShadeTop" />
              <div class="canvas-crop-shade is-left" :style="cropShadeLeft" />
              <div class="canvas-crop-shade is-right" :style="cropShadeRight" />
              <div class="canvas-crop-shade is-bottom" :style="cropShadeBottom" />
              <div class="canvas-crop-box" :style="cropBoxStyle" @pointerdown="startCropDrag('move', $event)">
                <span v-for="handle in cropHandles" :key="handle" :class="`is-${handle}`" @pointerdown.stop="startCropDrag(handle, $event)" />
              </div>
            </template>
          </div>
        </div>

        <p class="canvas-image-editor-help">拖动选区或四角控制点，保留选区内的画面。</p>
      </template>

      <footer>
        <button type="button" @click="emit('close')">取消</button>
        <button class="is-primary" type="button" :disabled="loading || Boolean(error) || saving || busy" @click="applyEdit">
          <LoaderCircle v-if="saving || busy" class="canvas-spin" :size="16" />
          <Crop v-else :size="16" />
          {{ saving || busy ? '处理中' : '完成裁剪' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { CircleAlert, Crop, LoaderCircle, X } from 'lucide-vue-next'
import { apiUrl } from '../services/api'

type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'
type CropRect = { x: number; y: number; width: number; height: number }

const props = defineProps<{ src: string; busy?: boolean }>()
const emit = defineEmits<{ close: []; apply: [payload: { blob: Blob; name: string }] }>()
const dialogId = `canvas-image-editor-${Math.random().toString(36).slice(2)}`
const stage = ref<HTMLDivElement | null>(null)
const imageElement = ref<HTMLImageElement | null>(null)
const objectUrl = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const imageReady = ref(false)
const naturalWidth = ref(1)
const naturalHeight = ref(1)
const stageSize = ref({ width: 760, height: 460 })
const cropRatio = ref('free')
const crop = ref<CropRect>({ x: 0, y: 0, width: 1, height: 1 })
let cropDrag: { handle: CropHandle; x: number; y: number; rect: CropRect } | null = null
const cropPresets = [{ label: '自由', value: 'free' }, { label: '1:1', value: '1' }, { label: '4:3', value: '1.333333' }, { label: '16:9', value: '1.777778' }, { label: '9:16', value: '0.5625' }]
const cropHandles: CropHandle[] = ['nw', 'ne', 'sw', 'se']
const mediaStyle = computed(() => {
  const availableWidth = Math.max(1, stageSize.value.width - 36)
  const availableHeight = Math.max(1, stageSize.value.height - 36)
  const ratio = naturalWidth.value / naturalHeight.value
  const width = Math.min(availableWidth, availableHeight * ratio)
  return { width: `${width}px`, height: `${width / ratio}px` }
})
const cropBoxStyle = computed(() => ({ left: percent(crop.value.x, naturalWidth.value), top: percent(crop.value.y, naturalHeight.value), width: percent(crop.value.width, naturalWidth.value), height: percent(crop.value.height, naturalHeight.value) }))
const cropShadeTop = computed(() => ({ left: '0', top: '0', right: '0', height: percent(crop.value.y, naturalHeight.value) }))
const cropShadeBottom = computed(() => ({ left: '0', top: percent(crop.value.y + crop.value.height, naturalHeight.value), right: '0', bottom: '0' }))
const cropShadeLeft = computed(() => ({ left: '0', top: percent(crop.value.y, naturalHeight.value), width: percent(crop.value.x, naturalWidth.value), height: percent(crop.value.height, naturalHeight.value) }))
const cropShadeRight = computed(() => ({ left: percent(crop.value.x + crop.value.width, naturalWidth.value), top: percent(crop.value.y, naturalHeight.value), right: '0', height: percent(crop.value.height, naturalHeight.value) }))

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  void loadSource()
  resizeObserver = new ResizeObserver(([entry]) => { if (entry) stageSize.value = { width: entry.contentRect.width, height: entry.contentRect.height } })
  nextTick(() => { if (stage.value) resizeObserver?.observe(stage.value) })
})
onBeforeUnmount(() => { resizeObserver?.disconnect(); if (objectUrl.value) URL.revokeObjectURL(objectUrl.value); window.removeEventListener('pointermove', moveCropDrag); window.removeEventListener('pointerup', endCropDrag) })

async function loadSource() {
  loading.value = true
  try {
    const response = await fetch(apiUrl(props.src), { credentials: 'include' })
    if (!response.ok) throw new Error(`原图读取失败 (${response.status})`)
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) throw new Error('当前文件不是可编辑图片')
    objectUrl.value = URL.createObjectURL(blob)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '无法读取原图' }
  finally { loading.value = false }
}

async function prepareImage() {
  const image = imageElement.value
  if (!image) return
  naturalWidth.value = image.naturalWidth
  naturalHeight.value = image.naturalHeight
  resetCrop()
  imageReady.value = true
}

function resetCrop() {
  const margin = Math.max(1, Math.round(Math.min(naturalWidth.value, naturalHeight.value) * .06))
  crop.value = { x: margin, y: margin, width: naturalWidth.value - margin * 2, height: naturalHeight.value - margin * 2 }
}

function setCropRatio(value: string) {
  cropRatio.value = value
  if (value === 'free') { resetCrop(); return }
  const ratio = Number(value)
  const maxWidth = naturalWidth.value * .88
  const maxHeight = naturalHeight.value * .88
  let width = maxWidth
  let height = width / ratio
  if (height > maxHeight) { height = maxHeight; width = height * ratio }
  crop.value = { x: (naturalWidth.value - width) / 2, y: (naturalHeight.value - height) / 2, width, height }
}

function startCropDrag(handle: CropHandle, event: PointerEvent) {
  event.preventDefault()
  cropDrag = { handle, ...imagePoint(event), rect: { ...crop.value } }
  window.addEventListener('pointermove', moveCropDrag)
  window.addEventListener('pointerup', endCropDrag, { once: true })
}

function moveCropDrag(event: PointerEvent) {
  if (!cropDrag) return
  const point = imagePoint(event)
  const dx = point.x - cropDrag.x
  const dy = point.y - cropDrag.y
  const source = cropDrag.rect
  const minimum = Math.max(24, Math.min(naturalWidth.value, naturalHeight.value) * .05)
  if (cropDrag.handle === 'move') {
    crop.value = { ...source, x: clamp(source.x + dx, 0, naturalWidth.value - source.width), y: clamp(source.y + dy, 0, naturalHeight.value - source.height) }
    return
  }
  let left = cropDrag.handle.includes('w') ? clamp(source.x + dx, 0, source.x + source.width - minimum) : source.x
  let right = cropDrag.handle.includes('e') ? clamp(source.x + source.width + dx, source.x + minimum, naturalWidth.value) : source.x + source.width
  let top = cropDrag.handle.includes('n') ? clamp(source.y + dy, 0, source.y + source.height - minimum) : source.y
  let bottom = cropDrag.handle.includes('s') ? clamp(source.y + source.height + dy, source.y + minimum, naturalHeight.value) : source.y + source.height
  if (cropRatio.value !== 'free') {
    const ratio = Number(cropRatio.value)
    const anchorX = cropDrag.handle.includes('w') ? right : left
    const anchorY = cropDrag.handle.includes('n') ? bottom : top
    let width = Math.abs(right - left)
    let height = width / ratio
    if (height > naturalHeight.value) { height = naturalHeight.value; width = height * ratio }
    left = cropDrag.handle.includes('w') ? clamp(anchorX - width, 0, anchorX - minimum) : anchorX
    right = cropDrag.handle.includes('e') ? clamp(anchorX + width, anchorX + minimum, naturalWidth.value) : anchorX
    top = cropDrag.handle.includes('n') ? clamp(anchorY - height, 0, anchorY - minimum) : anchorY
    bottom = cropDrag.handle.includes('s') ? clamp(anchorY + height, anchorY + minimum, naturalHeight.value) : anchorY
  }
  crop.value = { x: Math.min(left, right), y: Math.min(top, bottom), width: Math.abs(right - left), height: Math.abs(bottom - top) }
}

function endCropDrag() { cropDrag = null; window.removeEventListener('pointermove', moveCropDrag) }

function imagePoint(event: PointerEvent) {
  const rect = imageElement.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return { x: clamp((event.clientX - rect.left) / rect.width * naturalWidth.value, 0, naturalWidth.value), y: clamp((event.clientY - rect.top) / rect.height * naturalHeight.value, 0, naturalHeight.value) }
}

async function applyEdit() {
  const image = imageElement.value
  if (!image) return
  saving.value = true
  try {
    const source = crop.value
    const output = document.createElement('canvas')
    output.width = Math.max(1, Math.round(source.width))
    output.height = Math.max(1, Math.round(source.height))
    output.getContext('2d')?.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, output.width, output.height)
    emit('apply', { blob: await canvasBlob(output), name: `canvas-crop-${Date.now()}.png` })
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '图片处理失败' }
  finally { saving.value = false }
}

function canvasBlob(canvas: HTMLCanvasElement) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('浏览器无法导出图片')), 'image/png')) }
function percent(value: number, total: number) { return `${value / Math.max(1, total) * 100}%` }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)) }
</script>
