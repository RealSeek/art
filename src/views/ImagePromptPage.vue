<template>
  <section class="studio-index-page image-prompt-page">
    <div class="index-page-inner image-prompt-inner">
      <header class="index-page-header image-prompt-header">
        <div class="index-page-title"><h1>图片反推</h1><p>从参考图片提取可直接用于生成的提示词。</p></div>
        <div class="image-prompt-header-actions">
          <button class="image-prompt-model-button" type="button" :disabled="modelsLoading || running || submitting || restoring" :aria-expanded="modelPickerOpen" @click="modelPickerOpen = !modelPickerOpen">
            <ModelBadge v-if="activeModel" :model="activeModel" size="sm" /><span>{{ activeModel?.displayName || (modelsLoading ? '加载对话模型' : '选择对话模型') }}</span><ChevronDown :size="14" />
          </button>
          <button class="image-prompt-guide-button" type="button" :aria-expanded="historyOpen" @click="toggleHistory"><History :size="15" />反推历史</button>
        </div>
      </header>

      <div v-if="settingsLoaded && !featureEnabled" class="image-prompt-disabled" role="status">
        <CircleAlert :size="20" /><div><strong>图片反推暂未开放</strong><span>管理员可以在业务系统配置中启用此能力。</span></div>
      </div>
      <div v-if="modelError" class="canvas-feedback" role="alert"><span>{{ modelError }}</span><button type="button" @click="loadModels"><RefreshCw :size="15" />重新加载</button></div>
      <div v-if="assetError" class="canvas-feedback" role="alert"><span>{{ assetError }}</span></div>

      <div v-if="!settingsLoaded || featureEnabled" class="image-prompt-workbench">
        <section class="image-prompt-input-panel">
          <header><div><span>01</span><strong>参考图片</strong></div><button type="button" :disabled="running" @click="libraryOpen = true"><FolderOpen :size="15" />文件库</button></header>
          <button
            type="button"
            class="image-prompt-dropzone"
            :class="{ 'has-image': asset, 'is-dragging': dragging }"
            :aria-label="asset ? '更换参考图片' : '上传参考图片'"
            :disabled="running || uploading"
            @click="fileInput?.click()"
            @dragenter.prevent="dragging = true"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="dropFile"
          >
            <template v-if="asset">
              <img :src="apiUrl(asset.contentUrl)" :alt="asset.name" />
              <span class="image-prompt-image-overlay"><RefreshCw :size="16" />更换图片</span>
              <span class="image-prompt-image-name">{{ asset.name }}</span>
            </template>
            <template v-else>
              <span class="image-prompt-upload-icon"><ImagePlus :size="28" /></span>
              <strong>{{ uploading ? '正在上传' : '拖入或选择一张图片' }}</strong>
              <small>JPG、PNG、WebP、GIF、AVIF，最大 20 MB</small>
              <span><Upload :size="15" />选择图片</span>
            </template>
          </button>
          <input ref="fileInput" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" @change="selectFile" />

          <header class="image-prompt-section-heading"><div><span>02</span><strong>提取方式</strong></div></header>
          <div class="image-prompt-modes" role="radiogroup" aria-label="提示词提取方式">
            <button v-for="item in modes" :key="item.value" type="button" role="radio" :aria-checked="mode === item.value" :class="{ 'is-active': mode === item.value }" :disabled="running" @click="mode = item.value">
              <component :is="item.icon" :size="16" /><span><strong>{{ item.label }}</strong><small>{{ item.note }}</small></span>
            </button>
          </div>

          <div class="image-prompt-controls">
            <label><span>输出语言</span><select v-model="language" :disabled="running"><option value="zh-CN">简体中文</option><option value="en-US">English</option><option value="ja-JP">日本語</option></select></label>
            <button class="image-prompt-run" type="button" :disabled="!asset || !activeModel || uploading || submitting || running || !featureEnabled" @click="extractPrompt">
              <LoaderCircle v-if="running" class="image-prompt-spin" :size="17" /><ScanText v-else :size="17" />{{ running ? '正在分析图片' : '开始反推' }}
            </button>
          </div>
        </section>

        <section class="image-prompt-result-panel" aria-live="polite">
          <header>
            <div><span>03</span><strong>提示词结果</strong></div>
            <div v-if="result"><button type="button" title="复制提示词" @click="copyResult"><Check v-if="copied" :size="15" /><Copy v-else :size="15" />{{ copied ? '已复制' : '复制' }}</button></div>
          </header>

          <div v-if="running" class="image-prompt-progress">
            <span class="image-prompt-progress-visual"><ScanLine :size="30" /><i /></span>
            <strong>{{ status === 'QUEUED' ? '任务正在排队' : '视觉模型正在分析' }}</strong>
            <small>正在识别主体、构图、风格、光影与色彩</small>
            <button type="button" @click="cancelTask">取消任务</button>
          </div>
          <div v-else-if="error" class="image-prompt-error" role="alert">
            <CircleAlert :size="24" /><strong>{{ errorStage === 'upload' ? '上传失败' : '反推失败' }}</strong><p>{{ error }}</p><button type="button" :disabled="errorStage === 'extract' && !asset" @click="retryAfterError"><Upload v-if="errorStage === 'upload'" :size="15" /><RefreshCw v-else :size="15" />{{ errorStage === 'upload' ? '重新选择' : '重新提取' }}</button>
          </div>
          <div v-else-if="!result" class="image-prompt-empty">
            <ScanText :size="30" /><strong>等待提取</strong><span>选择图片和提取方式后，结果会显示在这里。</span>
          </div>
          <div v-else class="image-prompt-result">
            <div v-if="result.summary" class="image-prompt-summary"><Sparkles :size="15" /><span>{{ result.summary }}</span></div>
            <pre v-if="result.mode === 'JSON'">{{ jsonResult }}</pre>
            <template v-else>
              <section><span>正向提示词</span><p>{{ result.prompt }}</p></section>
              <section v-if="result.negativePrompt"><span>负向提示词</span><p>{{ result.negativePrompt }}</p></section>
              <dl v-if="structuredEntries.length" class="image-prompt-structured">
                <div v-for="entry in structuredEntries" :key="entry[0]"><dt>{{ structuredLabels[entry[0]] || entry[0] }}</dt><dd>{{ formatStructured(entry[1]) }}</dd></div>
              </dl>
              <div v-if="result.tags.length" class="image-prompt-tags"><span v-for="tag in result.tags" :key="tag">{{ tag }}</span></div>
            </template>
            <footer><span>{{ resultModelLabel }}</span><div><button type="button" :disabled="continuing" @click="continueConversation"><MessageSquareText :size="16" />继续对话</button><button type="button" @click="useForGeneration"><WandSparkles :size="16" />用于图片生成<ArrowRight :size="15" /></button></div></footer>
          </div>
        </section>
      </div>
    </div>

    <CanvasMediaDialog v-if="libraryOpen" kind="IMAGE" @close="libraryOpen = false" @select="chooseAsset" />
    <Teleport to="body">
      <div v-if="modelPickerOpen" class="canvas-modal-backdrop" @click.self="modelPickerOpen = false" @keydown.esc="modelPickerOpen = false">
        <div class="image-prompt-model-dialog"><button type="button" class="image-prompt-dialog-close" aria-label="关闭模型选择" @click="modelPickerOpen = false"><X :size="18" /></button><ModelCatalogPicker :models="chatModels" :model-value="selectedModel" title="选择对话模型" @select="selectModel" @configure-api-key="configureModels" /></div>
      </div>
      <div v-if="historyOpen" class="canvas-modal-backdrop" @click.self="historyOpen = false" @keydown.esc="historyOpen = false">
        <section class="image-prompt-history-dialog" role="dialog" aria-modal="true" aria-label="反推历史">
          <header><h2>反推历史</h2><button type="button" aria-label="关闭反推历史" @click="historyOpen = false"><X :size="19" /></button></header>
          <p v-if="historyLoading">正在加载历史...</p>
          <div v-else-if="historyError" role="alert"><p>{{ historyError }}</p><button type="button" @click="loadHistory"><RefreshCw :size="15" />重新加载</button></div>
          <p v-else-if="!history.length">还没有反推记录</p>
          <div v-else class="image-prompt-history-list">
            <button v-for="item in history" :key="item.id" type="button" :disabled="running || submitting || restoring" @click="restoreHistory(item)">
              <span><strong>{{ item.options.imagePromptResult?.summary || '图片反推' }}</strong><small>{{ modelLabel(item) }} · {{ formatHistoryDate(item.createdAt) }}</small></span><span>{{ statusLabels[item.status] }}</span><ChevronRight :size="16" />
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Braces, Check, ChevronDown, ChevronRight, CircleAlert, Copy, FileJson, FolderOpen, History, ImagePlus, Layers3, LoaderCircle, MessageSquareText, Palette, RefreshCw, ScanLine, ScanText, Sparkles, Upload, WandSparkles, X, Zap } from 'lucide-vue-next'
import CanvasMediaDialog, { type CanvasMediaAsset } from '../components/CanvasMediaDialog.vue'
import { api, apiUrl, streamApiEvents } from '../services/api'
import ModelCatalogPicker from '../components/ModelCatalogPicker.vue'
import ModelBadge from '../components/common/ModelBadge.vue'
import type { CatalogModel } from '../utils/model-catalog'
import { useStudioStore } from '../stores/studio'
import { stageCreationPrompt } from '../utils/prompt-transfer'

type ExtractionMode = 'GENERAL' | 'CONCISE' | 'STRUCTURED' | 'GRAPHIC_DESIGN' | 'JSON' | 'FLUX' | 'MIDJOURNEY' | 'STABLE_DIFFUSION'
type ExtractionResult = { prompt: string; negativePrompt: string; summary: string; tags: string[]; structured: Record<string, unknown>; raw: string; mode: ExtractionMode; language: string }
type ExtractionJob = { id: string; model: string; createdAt: string; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; creditCost: number; errorMessage?: string | null; options: { taskType?: string; assetId: string; mode: ExtractionMode; language: string; requestedModel?: string; imagePromptResult?: ExtractionResult } }
type PublicSettings = { imagePromptEnabled?: boolean }

const router = useRouter()
const studio = useStudioStore()
const fileInput = ref<HTMLInputElement | null>(null)
const asset = ref<CanvasMediaAsset | null>(null)
const mode = ref<ExtractionMode>('GENERAL')
const language = ref('zh-CN')
const uploading = ref(false)
const dragging = ref(false)
const libraryOpen = ref(false)
const historyOpen = ref(false)
const history = ref<ExtractionJob[]>([])
const historyLoading = ref(false)
const historyError = ref('')
const restoring = ref(false)
const chatModels = ref<CatalogModel[]>([])
const selectedModel = ref('')
const modelsLoading = ref(false)
const modelError = ref('')
const modelPickerOpen = ref(false)
const submitting = ref(false)
const continuing = ref(false)
const activeJob = ref<ExtractionJob | null>(null)
const assetError = ref('')
let mounted = true
const settingsLoaded = ref(false)
const featureEnabled = ref(true)
const jobId = ref('')
const status = ref<ExtractionJob['status'] | ''>('')
const result = ref<ExtractionResult | null>(null)
const error = ref('')
const errorStage = ref<'upload' | 'extract'>('extract')
const copied = ref(false)

const modes: Array<{ value: ExtractionMode; label: string; note: string; icon: Component }> = [
  { value: 'GENERAL', label: '通用', note: '适用于大多数图片', icon: MessageSquareText },
  { value: 'CONCISE', label: '简洁', note: '提取核心关键词', icon: Zap },
  { value: 'STRUCTURED', label: '结构化', note: '提取结构与元素', icon: Layers3 },
  { value: 'GRAPHIC_DESIGN', label: '平面设计', note: '提取设计要素', icon: Palette },
  { value: 'JSON', label: 'JSON', note: '输出结构化数据', icon: FileJson },
  { value: 'FLUX', label: 'Flux', note: '适配 Flux 模型', icon: Sparkles },
  { value: 'MIDJOURNEY', label: 'Midjourney', note: '优化 MJ 提示词', icon: WandSparkles },
  { value: 'STABLE_DIFFUSION', label: 'Stable Diffusion', note: '适配 SD 模型', icon: Braces },
]
const structuredLabels: Record<string, string> = { subject: '主体', environment: '环境', visualStyle: '视觉风格', lighting: '光影', composition: '构图', camera: '镜头', colorPalette: '色彩', materials: '材质', details: '细节' }
const running = computed(() => status.value === 'QUEUED' || status.value === 'RUNNING')
const activeModel = computed(() => chatModels.value.find((item) => item.key === selectedModel.value))
const resultModelLabel = computed(() => activeJob.value ? modelLabel(activeJob.value) : '')
const statusLabels: Record<ExtractionJob['status'], string> = { QUEUED: '排队中', RUNNING: '分析中', SUCCEEDED: '已完成', FAILED: '失败', CANCELLED: '已取消' }
const structuredEntries = computed(() => Object.entries(result.value?.structured || {}).filter(([, value]) => value !== '' && (!Array.isArray(value) || value.length)))
const jsonResult = computed(() => result.value ? JSON.stringify({ prompt: result.value.prompt, negativePrompt: result.value.negativePrompt, summary: result.value.summary, tags: result.value.tags, structured: result.value.structured }, null, 2) : '')

onMounted(async () => {
  window.addEventListener('paste', pasteImage)
  try {
    const settings = await api<PublicSettings>('/catalog/settings')
    featureEnabled.value = settings.imagePromptEnabled !== false
  } catch { /* The protected task endpoint remains the final authority. */ }
  finally { settingsLoaded.value = true }
  await loadModels()
})
onUnmounted(() => { mounted = false; window.removeEventListener('paste', pasteImage) })

async function loadModels() {
  modelsLoading.value = true; modelError.value = ''
  try {
    const catalog = await api<{ models: CatalogModel[]; defaultModel: string }>('/generations/image-prompt/models')
    chatModels.value = catalog.models
    if (!catalog.models.some((item) => item.key === selectedModel.value)) selectedModel.value = catalog.defaultModel
    if (!catalog.models.length) modelError.value = '没有可用的对话模型，请先接入对话 API 密钥'
  } catch (reason) { modelError.value = reason instanceof Error ? reason.message : '对话模型加载失败' }
  finally { modelsLoading.value = false }
}
function selectModel(value: string) { selectedModel.value = value; modelPickerOpen.value = false }
function configureModels() { modelPickerOpen.value = false; void router.push({ path: '/chat', query: { settings: 'api' } }) }
function modelLabel(job: ExtractionJob) { return chatModels.value.find((item) => item.key === job.options.requestedModel)?.displayName || job.model }
function formatHistoryDate(value: string) { return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function toggleHistory() { historyOpen.value = !historyOpen.value; if (historyOpen.value) void loadHistory() }
async function loadHistory() {
  historyLoading.value = true; historyError.value = ''
  try { history.value = await api<ExtractionJob[]>('/generations?kind=CHAT&taskType=IMAGE_PROMPT_EXTRACTION') }
  catch (reason) { historyError.value = reason instanceof Error ? reason.message : '反推历史加载失败' }
  finally { historyLoading.value = false }
}
async function restoreHistory(item: ExtractionJob) {
  if (running.value || submitting.value || restoring.value) return
  restoring.value = true; asset.value = null; assetError.value = ''; error.value = ''; result.value = null
  try {
    const job = await api<ExtractionJob>(`/generations/${item.id}`)
    jobId.value = job.id; activeJob.value = job; mode.value = job.options.mode; language.value = job.options.language
    if (job.options.requestedModel) selectedModel.value = job.options.requestedModel
    try { asset.value = await api<CanvasMediaAsset>(`/assets/${job.options.assetId}`) }
    catch (reason) { assetError.value = reason instanceof Error ? `原图无法恢复：${reason.message}` : '原图无法恢复' }
    historyOpen.value = false; status.value = job.status
    if (running.value) await monitorJob(job.id)
    else applyJob(job)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '历史恢复失败'
    if (historyOpen.value) historyError.value = message
    else { status.value = 'FAILED'; errorStage.value = 'extract'; error.value = message }
  }
  finally { restoring.value = false }
}

async function upload(file: File) {
  if (running.value || submitting.value || restoring.value) return
  errorStage.value = 'upload'
  if (!file.type.startsWith('image/')) { error.value = '请选择图片文件'; return }
  if (file.size > 20 * 1024 * 1024) { error.value = '图片不能超过 20 MB'; return }
  uploading.value = true
  error.value = ''
  result.value = null
  activeJob.value = null; jobId.value = ''; assetError.value = ''
  try {
    const form = new FormData(); form.append('file', file)
    asset.value = await api<CanvasMediaAsset>('/assets/uploads?kind=IMAGE&purpose=image-prompt', { method: 'POST', body: form })
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '图片上传失败' }
  finally { uploading.value = false }
}
function selectFile(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (file) void upload(file); input.value = '' }
function dropFile(event: DragEvent) { dragging.value = false; const file = event.dataTransfer?.files?.[0]; if (file) void upload(file) }
function pasteImage(event: ClipboardEvent) { const file = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'))?.getAsFile(); if (file) { event.preventDefault(); void upload(file) } }
function chooseAsset(value: CanvasMediaAsset) { asset.value = value; libraryOpen.value = false; result.value = null; error.value = ''; assetError.value = ''; activeJob.value = null; jobId.value = '' }

async function extractPrompt() {
  if (!asset.value || !activeModel.value || running.value || submitting.value) return
  submitting.value = true
  errorStage.value = 'extract'
  error.value = ''; result.value = null; copied.value = false
  try {
    const created = await api<ExtractionJob>('/generations', { method: 'POST', body: JSON.stringify({ kind: 'CHAT', model: selectedModel.value, prompt: '分析图片并生成提示词', options: { taskType: 'IMAGE_PROMPT_EXTRACTION', assetId: asset.value.id, mode: mode.value, language: language.value }, idempotencyKey: `image-prompt:${asset.value.id}:${Date.now()}` }) })
    jobId.value = created.id; status.value = created.status
    activeJob.value = created
    if (running.value) await monitorJob(created.id)
    else applyJob(created)
  } catch (reason) { status.value = 'FAILED'; error.value = reason instanceof Error ? reason.message : '图片反推失败' }
  finally { submitting.value = false }
}
async function monitorJob(id: string) {
  let completed: ExtractionJob
  try { completed = await streamApiEvents<ExtractionJob>(`/generations/${id}/events`, (job) => { if (mounted && jobId.value === id) status.value = job.status }) }
  catch { if (!mounted) return; completed = await pollJob(id) }
  if (mounted && jobId.value === id) applyJob(completed)
}
async function pollJob(id: string) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (!mounted) throw new Error('页面已关闭')
    const job = await api<ExtractionJob>(`/generations/${id}`); status.value = job.status
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.status)) return job
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new Error('任务等待超时，请稍后重试')
}
function applyJob(job: ExtractionJob) { activeJob.value = job; status.value = job.status; errorStage.value = 'extract'; error.value = ''; if (job.status === 'SUCCEEDED' && job.options.imagePromptResult) result.value = job.options.imagePromptResult; else error.value = job.errorMessage || (job.status === 'CANCELLED' ? '任务已取消' : '视觉模型没有返回可用结果') }
async function continueConversation() {
  if (!result.value || !jobId.value || continuing.value) return
  continuing.value = true
  try {
    const conversation = await api<{ id: string }>(`/generations/${jobId.value}/conversation`, { method: 'POST', body: '{}' })
    await studio.hydrateWorkspace(true)
    await studio.openConversation(conversation.id)
    await router.push('/chat')
  } catch (reason) { assetError.value = reason instanceof Error ? reason.message : '继续对话失败' }
  finally { continuing.value = false }
}
async function cancelTask() { if (!jobId.value) return; try { applyJob(await api<ExtractionJob>(`/generations/${jobId.value}/cancel`, { method: 'POST', body: '{}' })) } catch (reason) { error.value = reason instanceof Error ? reason.message : '取消任务失败' } }
function retryAfterError() { if (errorStage.value === 'upload') fileInput.value?.click(); else void extractPrompt() }
async function copyResult() { if (!result.value) return; await navigator.clipboard.writeText(result.value.mode === 'JSON' ? jsonResult.value : result.value.prompt); copied.value = true; window.setTimeout(() => { copied.value = false }, 1800) }
function useForGeneration() { if (!result.value) return; stageCreationPrompt({ type: 'IMAGE', prompt: result.value.prompt, title: result.value.summary || '图片反推提示词', sourceName: '图片反推' }); void router.push('/image') }
function formatStructured(value: unknown) { return Array.isArray(value) ? value.join('、') : String(value || '') }
</script>
