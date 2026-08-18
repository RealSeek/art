<template>
  <section class="canvas-drama-production-panel">
    <header>
      <div><span>PRODUCTION DESK</span><strong>短剧制作台</strong><p>先检查镜头输入，再按分镜到成片的顺序批量生产。</p></div>
      <button type="button" aria-label="关闭制作台" title="关闭制作台" @click="emit('close')"><X :size="17" /></button>
    </header>

    <div class="canvas-production-overview">
      <div><strong>{{ summary.shots }}</strong><span>镜头</span></div>
      <div><strong>{{ summary.duration }}s</strong><span>预计成片</span></div>
      <div><strong>{{ summary.running }}</strong><span>执行中</span></div>
      <div :class="{ 'has-error': summary.failed }"><strong>{{ summary.failed }}</strong><span>需处理</span></div>
    </div>

    <article class="canvas-production-stage">
      <header><span><ImageIcon :size="16" /><strong>分镜图</strong></span><b>{{ summary.storyboardDone }}/{{ summary.shots }}</b></header>
      <progress :value="summary.storyboardDone" :max="Math.max(1, summary.shots)" />
      <p>{{ storyboardMessage }}</p>
      <button type="button" :disabled="busy || !summary.storyboardReady" @click="emit('generate', 'STORYBOARD')"><Sparkles :size="15" />生成 {{ summary.storyboardReady }} 个就绪分镜</button>
    </article>

    <article class="canvas-production-stage">
      <header><span><Video :size="16" /><strong>镜头成片</strong></span><b>{{ summary.videoDone }}/{{ summary.shots }}</b></header>
      <progress :value="summary.videoDone" :max="Math.max(1, summary.shots)" />
      <p>{{ videoMessage }}</p>
      <button type="button" :disabled="busy || !summary.videoReady" @click="emit('generate', 'PRODUCTION')"><Film :size="15" />生成 {{ summary.videoReady }} 个就绪成片</button>
    </article>

    <div v-if="batch.active" class="canvas-production-batch" aria-live="polite">
      <span><LoaderCircle class="canvas-spin" :size="16" /><strong>{{ batch.label }}</strong></span>
      <progress :value="batch.completed" :max="Math.max(1, batch.total)" />
      <small>{{ batch.completed }}/{{ batch.total }}，当前任务完成后可停止后续排队</small>
      <button type="button" @click="emit('stop')"><CircleStop :size="14" />停止后续任务</button>
    </div>
    <p v-else-if="batch.message" class="canvas-production-message" :class="{ 'is-error': batch.error }">{{ batch.message }}</p>

    <footer>
      <button type="button" @click="emit('arrange')"><ListTree :size="15" />整理镜头流水线</button>
      <button type="button" @click="emit('focus', summary.failed ? 'FAILED' : 'PENDING')"><ScanSearch :size="15" />{{ summary.failed ? '定位失败镜头' : '定位待生产镜头' }}</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CircleStop, Film, Image as ImageIcon, ListTree, LoaderCircle, ScanSearch, Sparkles, Video, X } from 'lucide-vue-next'

export interface DramaProductionSummary {
  shots: number
  duration: number
  storyboardDone: number
  storyboardReady: number
  storyboardBlocked: number
  videoDone: number
  videoReady: number
  videoBlocked: number
  running: number
  failed: number
}

export interface DramaBatchState { active: boolean; label: string; total: number; completed: number; message: string; error: boolean }

const props = defineProps<{ summary: DramaProductionSummary; batch: DramaBatchState }>()
const emit = defineEmits<{ close: []; generate: [stage: 'STORYBOARD' | 'PRODUCTION']; stop: []; arrange: []; focus: [kind: 'FAILED' | 'PENDING'] }>()
const busy = computed(() => props.batch.active)
const storyboardMessage = computed(() => props.summary.storyboardBlocked ? `${props.summary.storyboardBlocked} 个镜头缺少提示词或可用图片模型。` : props.summary.storyboardReady ? '提示词和模型已就绪，可按队列顺序生成。' : '当前没有待生成的分镜图。')
const videoMessage = computed(() => props.summary.videoBlocked ? `${props.summary.videoBlocked} 个镜头需要先完成分镜图或配置视频模型。` : props.summary.videoReady ? '分镜参考与视频模型已就绪。' : '当前没有待生成的镜头成片。')
</script>
