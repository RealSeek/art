<template>
    <main ref="pageElement" class="prompt-library-page">
      <div class="prompt-library-inner">
        <header class="prompt-library-header">
          <div><h1>提示词库</h1><p>{{ loading && !items.length ? '正在加载提示词库' : `${total.toLocaleString('zh-CN')} 条图片提示词` }}</p></div>
          <label><Search :size="17" /><input v-model="query" placeholder="搜索标题、内容或标签" /></label>
        </header>

        <div v-if="error" class="prompt-library-error" role="alert"><CircleAlert :size="17" /><span>{{ error }}</span><button type="button" @click="loadPage(page)">重试</button></div>

        <div class="prompt-library-layout">
          <aside class="prompt-library-filters">
            <section><strong>分类</strong><button type="button" :aria-pressed="!sourceId" :class="{ active: !sourceId }" @click="sourceId = ''"><span>全部提示词</span><em>{{ loading && !sources.length ? '...' : sourceTotal }}</em></button><div v-if="loading && !sources.length" class="prompt-library-filter-skeleton"><i v-for="index in 6" :key="index" /></div><button v-for="source in sources" :key="source.id" type="button" :aria-pressed="sourceId === source.id" :class="{ active: sourceId === source.id }" @click="sourceId = source.id"><span>{{ source.name }}</span><em>{{ source.count }}</em></button></section>
            <section v-if="tags.length"><strong>热门标签</strong><button type="button" :aria-pressed="!tag" :class="{ active: !tag }" @click="tag = ''"><span>全部标签</span></button><button v-for="item in tags.slice(0, 24)" :key="item.name" type="button" :aria-pressed="tag === item.name" :class="{ active: tag === item.name }" @click="tag = item.name"><span>{{ item.name }}</span><em>{{ item.count }}</em></button></section>
          </aside>

          <section class="prompt-library-results" aria-live="polite" :aria-busy="loading">
            <div v-if="loading && !items.length" class="prompt-library-grid prompt-library-grid--skeleton" aria-label="正在加载提示词"><article v-for="index in 8" :key="index"><i /><span /><span /><span /></article></div>
            <div v-else-if="!items.length" class="prompt-library-empty"><FileText :size="28" /><strong>没有找到提示词</strong><button type="button" @click="clearFilters">清除筛选</button></div>
            <div v-else class="prompt-library-grid">
              <article v-for="item in items" :key="item.id" class="prompt-library-card">
                <button class="prompt-library-card__open" type="button" :aria-label="`查看 ${item.title}`" @click="selected = item">
                  <span class="prompt-library-card__media">
                    <img v-if="item.coverUrl && !brokenImages.has(item.id)" :src="item.coverUrl" :alt="item.title" loading="lazy" referrerpolicy="no-referrer" @error="markImageBroken(item.id)" />
                    <ImageIcon v-else :size="28" />
                  </span>
                  <span class="prompt-library-card__body">
                  <span class="prompt-library-card__heading"><strong>{{ item.title }}</strong><small>{{ item.sourceName }}</small></span>
                  <span class="prompt-library-card__prompt">{{ item.description || compactPrompt(item.prompt) }}</span>
                  <span v-if="item.tags.length" class="prompt-library-card__tags"><em v-for="itemTag in item.tags.slice(0, 3)" :key="itemTag">{{ itemTag }}</em></span>
                  </span>
                </button>
                <footer><button type="button" :title="copiedId === item.id ? '已复制' : '复制提示词'" @click="copyPrompt(item)"><Check v-if="copiedId === item.id" :size="15" /><Copy v-else :size="15" /><span>{{ copiedId === item.id ? '已复制' : '复制' }}</span></button><button class="primary" type="button" title="用于图片生成" @click="usePrompt(item)"><ImageIcon :size="15" /><span>使用</span></button></footer>
              </article>
            </div>
            <nav v-if="total > pageSize" class="prompt-library-pagination" aria-label="提示词分页">
              <button type="button" :disabled="loading || page <= 1" @click="loadPage(page - 1, true)"><ChevronLeft :size="16" />上一页</button>
              <span>第 {{ page }} / {{ pageCount }} 页</span>
              <button type="button" :disabled="loading || page >= pageCount" @click="loadPage(page + 1, true)">下一页<ChevronRight :size="16" /></button>
            </nav>
          </section>
        </div>
      </div>
    </main>

    <Teleport to="body">
      <div v-if="selected" class="prompt-library-modal-layer" @mousedown.self="selected = null">
        <article class="prompt-library-modal" role="dialog" aria-modal="true" :aria-label="selected.title">
          <header><div><strong>{{ selected.title }}</strong><span>{{ selected.sourceName }}<template v-if="selected.author"> · {{ selected.author }}</template></span></div><button type="button" title="关闭" aria-label="关闭" @click="selected = null"><X :size="18" /></button></header>
          <div class="prompt-library-modal__content"><img v-if="selected.coverUrl && !brokenImages.has(selected.id)" class="prompt-library-modal__image" :src="selected.coverUrl" :alt="selected.title" referrerpolicy="no-referrer" @error="markImageBroken(selected.id)" /><section><div class="prompt-library-modal__tags"><span v-for="itemTag in selected.tags" :key="itemTag">{{ itemTag }}</span></div><p>{{ selected.prompt }}</p></section></div>
          <footer><button type="button" @click="copyPrompt(selected)"><Copy :size="15" />复制提示词</button><button class="primary" type="button" @click="usePrompt(selected)"><ImageIcon :size="15" />用于图片生成</button></footer>
        </article>
      </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Check, ChevronLeft, ChevronRight, CircleAlert, Copy, FileText, Image as ImageIcon, Search, X } from 'lucide-vue-next'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { stageImagePrompt } from '../utils/prompt-transfer'

type PromptItem = { id: string; sourceId: string; sourceName: string; title: string; prompt: string; description: string; tags: string[]; author: string; imageModel: string; coverUrl: string }
type Source = { id: string; name: string; count: number }
type PromptResponse = { items: PromptItem[]; total: number; page: number; pageSize: number; sources: Source[]; tags: Array<{ name: string; count: number }>; partial: boolean }

const router = useRouter()
const auth = useAuthStore()
const CACHE_KEY = 'xinyue:prompt-library:default:v2'
function readCache() {
  try {
    const entry = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || 'null') as { savedAt: number; data: PromptResponse } | null
    const data = entry?.data
    const valid = data
      && Date.now() - entry.savedAt < 5 * 60 * 1000
      && Array.isArray(data.items)
      && data.items.length > 0
      && data.total > 0
      && Array.isArray(data.sources)
      && data.sources.some((source) => source.count > 0)
    return valid ? entry : null
  } catch { return null }
}
const cached = readCache()
const pageElement = ref<HTMLElement | null>(null)
const items = ref<PromptItem[]>(cached?.data.items || [])
const sources = ref<Source[]>(cached?.data.sources || [])
const tags = ref<Array<{ name: string; count: number }>>(cached?.data.tags || [])
const total = ref(cached?.data.total || 0)
const page = ref(cached?.data.page || 1)
const pageSize = ref(cached?.data.pageSize || 24)
const query = ref('')
const sourceId = ref('')
const tag = ref('')
const loading = ref(!cached)
const error = ref('')
const selected = ref<PromptItem | null>(null)
const copiedId = ref('')
const brokenImages = ref(new Set<string>())
const sourceTotal = computed(() => sources.value.reduce((sum, source) => sum + source.count, 0))
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
let requestSequence = 0
let searchTimer = 0

async function loadPage(nextPage = 1, scroll = false) {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize.value) })
    if (query.value.trim()) params.set('q', query.value.trim())
    if (sourceId.value) params.set('source', sourceId.value)
    if (tag.value) params.set('tag', tag.value)
    const result = await api<PromptResponse>(`/prompt-library?${params}`)
    if (sequence !== requestSequence) return
    if (result.partial && !result.items.length) {
      error.value = '部分提示词分类暂时不可用'
      return
    }
    items.value = result.items
    sources.value = result.sources
    tags.value = result.tags
    total.value = result.total
    page.value = result.page
    pageSize.value = result.pageSize
    if (nextPage === 1 && !query.value.trim() && !sourceId.value && !tag.value) {
      try { window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: result })) } catch { /* Storage can be unavailable in private mode. */ }
    }
    if (scroll) pageElement.value?.closest('.workspace-main')?.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (reason) {
    if (sequence === requestSequence) error.value = reason instanceof Error ? reason.message : '提示词库加载失败'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function clearFilters() { query.value = ''; sourceId.value = ''; tag.value = '' }
function compactPrompt(prompt: string) { return prompt.replace(/\s+/g, ' ').slice(0, 210) }
function markImageBroken(id: string) { brokenImages.value = new Set(brokenImages.value).add(id) }
async function copyPrompt(item: PromptItem) { await navigator.clipboard.writeText(item.prompt); copiedId.value = item.id; window.setTimeout(() => { if (copiedId.value === item.id) copiedId.value = '' }, 1600) }
async function usePrompt(item: PromptItem) {
  stageImagePrompt({ prompt: item.prompt, title: item.title, sourceName: item.sourceName })
  selected.value = null
  await router.push(auth.isAuthenticated ? '/image' : '/login?redirect=/image')
}

watch(query, () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void loadPage(1) }, 320) })
watch([sourceId, tag], () => { void loadPage(1) })
onMounted(() => { void loadPage(1) })
</script>
