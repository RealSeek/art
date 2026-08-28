<template>
  <div class="workspace-task-center">
    <button type="button" aria-label="任务中心" title="任务中心" :aria-expanded="open" @click="toggle">
      <ListChecks :size="18" />
      <span v-if="activeCount" class="workspace-task-count">{{ activeCount > 9 ? '9+' : activeCount }}</span>
    </button>
    <section v-if="open" class="workspace-task-panel" aria-label="任务中心">
      <header>
        <div><strong>任务中心</strong><small>{{ activeCount ? `${activeCount} 个任务正在处理` : '最近的生成任务' }}</small></div>
        <button type="button" aria-label="刷新任务" title="刷新" :disabled="loading" @click="load"><RefreshCw :size="16" :class="{ 'is-spinning': loading }" /></button>
      </header>
      <div v-if="loading && !jobs.length" class="workspace-task-empty">正在读取任务...</div>
      <div v-else-if="!jobs.length" class="workspace-task-empty">暂无生成任务</div>
      <div v-else class="workspace-task-list">
        <article v-for="job in jobs" :key="job.id">
          <span class="workspace-task-icon"><MessageSquare v-if="job.kind === 'CHAT'" :size="16" /><Video v-else-if="job.kind === 'VIDEO'" :size="16" /><Image v-else :size="16" /></span>
          <div>
            <strong>{{ kindLabel[job.kind] }}</strong>
            <p>{{ job.prompt }}</p>
            <small>{{ statusLabel[job.status] }} · {{ formatTime(job.createdAt) }}</small>
          </div>
          <nav>
            <button v-if="activeStatuses.has(job.status)" type="button" aria-label="停止任务" title="停止" :disabled="busyId === job.id" @click="cancel(job)"><Square :size="15" /></button>
            <button v-else-if="retryStatuses.has(job.status)" type="button" aria-label="重试任务" title="重试" :disabled="busyId === job.id" @click="retry(job)"><RotateCcw :size="15" /></button>
          </nav>
        </article>
      </div>
      <p v-if="error" class="workspace-task-error">{{ error }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Image, ListChecks, MessageSquare, RefreshCw, RotateCcw, Square, Video } from 'lucide-vue-next'
import { api } from '../../services/api'

type TaskJob = {
  id: string
  kind: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  prompt: string
  createdAt: string
}

const open = ref(false)
const loading = ref(false)
const busyId = ref('')
const error = ref('')
const jobs = ref<TaskJob[]>([])
const activeStatuses = new Set<TaskJob['status']>(['QUEUED', 'RUNNING'])
const retryStatuses = new Set<TaskJob['status']>(['FAILED', 'CANCELLED'])
const kindLabel: Record<TaskJob['kind'], string> = { CHAT: '对话', IMAGE: '图片生成', VIDEO: '视频生成', COMMERCE: '商品视觉' }
const statusLabel: Record<TaskJob['status'], string> = { QUEUED: '排队中', RUNNING: '处理中', SUCCEEDED: '已完成', FAILED: '失败', CANCELLED: '已取消' }
const activeCount = computed(() => jobs.value.filter((job) => activeStatuses.has(job.status)).length)
let timer: number | undefined

async function load() {
  loading.value = true
  error.value = ''
  try { jobs.value = (await api<TaskJob[]>('/generations')).slice(0, 30) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '任务读取失败' }
  finally { loading.value = false }
}

async function toggle() {
  open.value = !open.value
  if (open.value) await load()
}

async function cancel(job: TaskJob) {
  busyId.value = job.id
  try { await api(`/generations/${job.id}/cancel`, { method: 'POST' }); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '停止任务失败' }
  finally { busyId.value = '' }
}

async function retry(job: TaskJob) {
  busyId.value = job.id
  try { await api(`/generations/${job.id}/retry`, { method: 'POST' }); await load() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '重试任务失败' }
  finally { busyId.value = '' }
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => { void load(); timer = window.setInterval(() => { if (open.value || activeCount.value) void load() }, 5000) })
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })
</script>
