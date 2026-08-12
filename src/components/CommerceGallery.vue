<template>
  <Teleport to="body">
    <div class="commerce-gallery-layer" role="presentation" @mousedown.self="$emit('close')">
      <section class="commerce-gallery" role="dialog" aria-modal="true" aria-labelledby="commerce-gallery-title">
        <header>
          <div>
            <span>{{ typeLabel }} · {{ currentIndex + 1 }} / {{ run.assets.length }}</span>
            <h2 id="commerce-gallery-title">{{ currentAsset?.moduleLabel || run.prompt }}</h2>
          </div>
          <div class="commerce-gallery__actions">
            <button type="button" title="下载当前图片" aria-label="下载当前图片" @click="downloadAsset(currentAsset)"><Download :size="18" /></button>
            <button type="button" title="下载全部图片" aria-label="下载全部图片" @click="downloadAll"><Archive :size="18" /></button>
            <button type="button" title="关闭" aria-label="关闭" @click="$emit('close')"><X :size="20" /></button>
          </div>
        </header>

        <div class="commerce-gallery__stage" :class="{ 'is-detail': isDetail }">
          <button class="commerce-gallery__arrow is-previous" type="button" title="上一张" aria-label="上一张" :disabled="run.assets.length < 2" @click="previous"><ChevronLeft :size="24" /></button>
          <div class="commerce-gallery__viewport">
            <img v-if="currentAsset?.contentUrl" :src="currentAsset.contentUrl" :alt="currentAsset.moduleLabel || currentAsset.title" />
            <div v-else class="commerce-gallery__missing"><ImageOff :size="28" /><span>图片暂不可用</span></div>
          </div>
          <button class="commerce-gallery__arrow is-next" type="button" title="下一张" aria-label="下一张" :disabled="run.assets.length < 2" @click="next"><ChevronRight :size="24" /></button>
        </div>

        <footer>
          <div class="commerce-gallery__thumbs" aria-label="商品图列表">
            <button v-for="(asset, index) in run.assets" :key="asset.id" type="button" :class="{ 'is-active': index === currentIndex }" :aria-label="`查看第 ${index + 1} 张：${asset.moduleLabel || asset.title}`" @click="currentIndex = index">
              <img :src="asset.contentUrl" :alt="asset.moduleLabel || asset.title" />
              <span>{{ index + 1 }}</span>
            </button>
          </div>
          <button class="commerce-gallery__reuse" type="button" @click="$emit('reuse', currentAsset, run)"><ImagePlus :size="17" />继续创作</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Archive, ChevronLeft, ChevronRight, Download, ImageOff, ImagePlus, X } from 'lucide-vue-next'
import type { GenerationRun, StudioAsset } from '../types'

const props = defineProps<{ run: GenerationRun }>()
defineEmits<{ close: []; reuse: [asset: StudioAsset | undefined, run: GenerationRun] }>()

const currentIndex = ref(0)
const currentAsset = computed(() => props.run.assets[currentIndex.value])
const typeLabel = computed(() => props.run.request.creationType || props.run.assets[0]?.creationType || '商品素材包')
const isDetail = computed(() => typeLabel.value.includes('详情'))

watch(() => props.run.id, () => { currentIndex.value = 0 })
function previous() { currentIndex.value = (currentIndex.value - 1 + props.run.assets.length) % props.run.assets.length }
function next() { currentIndex.value = (currentIndex.value + 1) % props.run.assets.length }
function fileName(asset: StudioAsset, index = currentIndex.value) { return `${typeLabel.value}-${String(index + 1).padStart(2, '0')}-${asset.moduleLabel || asset.title}`.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120) }
async function downloadAsset(asset?: StudioAsset, index = currentIndex.value) {
  if (!asset?.contentUrl) return
  const response = await fetch(asset.contentUrl, { credentials: 'include' })
  if (!response.ok) return
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName(asset, index)}.${asset.mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function downloadAll() {
  for (const [index, asset] of props.run.assets.entries()) {
    await downloadAsset(asset, index)
    await new Promise((resolve) => window.setTimeout(resolve, 180))
  }
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') previous()
  if (event.key === 'ArrowRight') next()
  if (event.key === 'Escape') document.querySelector<HTMLButtonElement>('.commerce-gallery__actions button:last-child')?.click()
}
onMounted(() => { document.body.classList.add('has-commerce-gallery'); window.addEventListener('keydown', onKeydown) })
onUnmounted(() => { document.body.classList.remove('has-commerce-gallery'); window.removeEventListener('keydown', onKeydown) })
</script>
