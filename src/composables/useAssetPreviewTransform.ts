import { computed, reactive, ref } from 'vue'

interface AssetPreviewTransformOptions {
  isEnabled?: () => boolean
  isVideo?: () => boolean
  minScale?: number
  maxScale?: number
}

export function useAssetPreviewTransform(options: AssetPreviewTransformOptions = {}) {
  const viewport = ref<HTMLElement | null>(null)
  const dragging = ref(false)
  const dragMode = ref(false)
  const videoRatio = ref(16 / 9)
  const view = reactive({ scale: 1, x: 0, y: 0 })
  const pointer = reactive({ id: -1, x: 0, y: 0 })
  const minScale = options.minScale ?? 0.3
  const maxScale = options.maxScale ?? 5

  const canvasStyle = computed(() => ({
    transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
  }))
  const videoFrameStyle = computed(() => ({ aspectRatio: String(videoRatio.value) }))

  function setViewport(element: unknown) {
    viewport.value = element instanceof HTMLElement ? element : null
  }

  function stopDragging() {
    dragging.value = false
    pointer.id = -1
  }

  function resetView() {
    view.scale = 1
    view.x = 0
    view.y = 0
    videoRatio.value = 16 / 9
    stopDragging()
  }

  function toggleDragMode() {
    dragMode.value = !dragMode.value
    stopDragging()
  }

  function syncVideoRatio(event: Event) {
    const video = event.currentTarget as HTMLVideoElement
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      videoRatio.value = video.videoWidth / video.videoHeight
    }
  }

  function zoomAt(value: number, clientX?: number, clientY?: number) {
    const element = viewport.value
    const nextScale = Math.min(maxScale, Math.max(minScale, value))
    if (!element || nextScale === view.scale) return

    const rect = element.getBoundingClientRect()
    const pointX = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2
    const pointY = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2
    const ratio = nextScale / view.scale

    view.x = pointX - (pointX - view.x) * ratio
    view.y = pointY - (pointY - view.y) * ratio
    view.scale = nextScale
  }

  function zoomBy(delta: number) {
    zoomAt(view.scale + delta)
  }

  function handlePreviewWheel(event: WheelEvent) {
    if (options.isEnabled && !options.isEnabled()) return
    event.preventDefault()
    zoomAt(view.scale * (event.deltaY < 0 ? 1.12 : 0.89), event.clientX, event.clientY)
  }

  function startPan(event: PointerEvent) {
    if (options.isEnabled && !options.isEnabled()) return
    if (event.button !== 0) return
    if (options.isVideo?.()) {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.classList.contains('asset-preview-video-drag-surface')) return
    }

    pointer.id = event.pointerId
    pointer.x = event.clientX
    pointer.y = event.clientY
    dragging.value = true
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function movePan(event: PointerEvent) {
    if (!dragging.value || event.pointerId !== pointer.id) return
    view.x += event.clientX - pointer.x
    view.y += event.clientY - pointer.y
    pointer.x = event.clientX
    pointer.y = event.clientY
  }

  function endPan(event: PointerEvent) {
    if (event.pointerId !== pointer.id) return
    stopDragging()
  }

  return {
    canvasStyle,
    dragging,
    dragMode,
    endPan,
    handlePreviewWheel,
    movePan,
    resetView,
    setViewport,
    startPan,
    syncVideoRatio,
    toggleDragMode,
    videoFrameStyle,
    view,
    zoomBy,
  }
}
