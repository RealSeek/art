<template>
            <div v-if="message" class="message-row" :class="[`message-row--${message.role}`, { 'is-jump-highlight': highlight }]" :data-message-id="message.id" :data-user-message="message.role === 'user' ? 'true' : undefined" :data-response-phase="message.role === 'assistant' ? responseState.phase : undefined">
              <form v-if="editing" class="message-editor" @submit.prevent="$emit('save-edit')">
                <textarea v-model="editingMessageContent" rows="3" maxlength="50000" aria-label="编辑消息" @keydown.esc="$emit('cancel-edit')" />
                <footer><button type="button" @click="$emit('cancel-edit')">取消</button><button type="submit" :disabled="!editingMessageContent.trim() || store.isGenerating">保存并提交</button></footer>
              </form>
              <template v-else>
                <header v-if="message.role === 'assistant' && message.model" class="message-model-line">
                  <ModelBadge :model="{ displayName: message.model }" size="sm" /><span>{{ message.model }}</span>
                </header>
                <details v-if="message.role === 'assistant' && responseState.hasProcess" class="message-process" :class="[message.webSearch ? `is-${message.webSearch.status}` : '', `is-phase-${responseState.phase}`]" open>
                  <summary>
                    <LoaderCircle v-if="responseState.isProcessRunning" class="message-process__spinner" :size="16" aria-hidden="true" />
                    <BrainCircuit v-else :size="16" aria-hidden="true" />
                    <span>{{ responseState.processTitle }}</span>
                    <small aria-live="polite">{{ responseState.processStatus }}</small>
                    <ChevronDown :size="14" aria-hidden="true" />
                  </summary>
                  <div v-if="responseState.isProcessRunning" class="message-process__progress" aria-hidden="true"><i /></div>
                  <div class="message-process__body">
                    <div class="message-process__steps">
                      <div v-if="responseState.isStreaming && !message.webSearch">
                        <LoaderCircle class="message-process__spinner" :size="15" /><span><strong>正在思考</strong><small>{{ message.reasoning?.trim() ? responseState.reasoningSummary : '正在分析问题并组织回答' }}</small></span>
                      </div>
                      <div v-if="message.webSearch?.status === 'searching'">
                        <LoaderCircle class="message-process__spinner" :size="15" /><span><strong>查找可靠来源</strong><small>正在规划关键词并检索公开网页</small></span>
                      </div>
                      <div v-if="message.webSearch?.queries.length">
                        <Search :size="15" /><span><strong>检索关键词</strong><small>{{ message.webSearch.queries.join(' · ') }}</small></span>
                      </div>
                      <div v-if="message.webSearch?.sources.length">
                        <BookOpenCheck :size="15" /><span><strong>核验资料</strong><small>已读取 {{ message.webSearch.sources.length }} 个网页来源</small></span>
                      </div>
                      <div v-if="message.webSearch?.status === 'failed'">
                        <CircleAlert :size="15" /><span><strong>联网检索未完成</strong><small>{{ message.webSearch.error || '当前搜索渠道暂时不可用' }}</small></span>
                      </div>
                      <div v-if="responseState.reasoningSummary">
                        <Sparkles :size="15" /><span><strong>组织回答</strong><small>{{ responseState.reasoningSummary }}</small></span>
                      </div>
                      <div v-else-if="responseState.isStreaming && message.content.trim()">
                        <Sparkles class="message-process__thinking-icon" :size="15" /><span><strong>正在生成回答</strong><small>内容正在实时输出</small></span>
                      </div>
                      <div v-else-if="message.webSearch?.status === 'completed'">
                        <CheckCircle2 :size="15" /><span><strong>组织回答</strong><small>已结合检索资料完成回答并检查引用</small></span>
                      </div>
                    </div>
                    <div v-if="message.reasoning?.trim()" class="message-process__reasoning">
                      <span>模型思考</span>
                      <p>{{ message.reasoning }}</p>
                    </div>
                    <div v-if="message.webSearch?.sources.length" class="message-process__sources">
                      <a v-for="(source, sourceIndex) in message.webSearch.sources" :key="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">
                        <span>{{ sourceIndex + 1 }}</span><strong>{{ source.title }}</strong><small>{{ sourceDomain(source.url) }}</small><ArrowRight :size="14" />
                      </a>
                    </div>
                  </div>
                </details>
                <div v-if="responseState.isPending && !message.webSearch" class="message-inline-thinking" aria-live="polite"><span class="chat-thinking-dots" aria-hidden="true"><i /><i /><i /></span><span>正在思考</span></div>
                <article v-if="responseState.shouldRender" :class="`message message--${message.role}${responseState.isStreaming ? ' message--streaming' : ''}`">
                  <ChatMessageContent v-if="message.role === 'assistant'" :content="message.content" @preview="$emit('preview-artifact', $event)" />
                  <template v-else>{{ message.content }}</template>
                  <span v-if="responseState.isStreaming && message.role === 'assistant' && message.content" class="chat-stream-cursor" aria-hidden="true" />
                </article>
                <section v-if="message.role === 'assistant' && message.webSearch?.sources.length && responseState.shouldRender" class="message-citations" aria-label="引用来源">
                  <header><BookOpenCheck :size="15" /><strong>引用来源</strong><small>{{ message.webSearch.sources.length }} 个网页来源</small></header>
                  <div>
                    <a v-for="(source, sourceIndex) in message.webSearch.sources" :key="`citation-${source.url}`" :href="source.url" target="_blank" rel="noopener noreferrer">
                      <span>[{{ sourceIndex + 1 }}]</span><strong>{{ source.title }}</strong><small>{{ sourceDomain(source.url) }}</small><ArrowRight :size="14" />
                    </a>
                  </div>
                </section>
                <nav v-if="message.id !== 'welcome' && responseState.shouldRender" class="message-actions" :aria-label="`${message.role === 'user' ? '用户' : '助手'}消息操作`">
                  <button type="button" :title="copied ? '已复制' : '复制'" @click="copyMessage(message)"><Check v-if="copied" :size="15" /><Copy v-else :size="15" /></button>
                  <span v-if="orderedBranches.length > 1" class="message-branch-nav" aria-label="消息分支">
                    <button type="button" title="上一个分支" :disabled="store.isGenerating || currentBranchPosition <= 0" @click="switchBranch(-1)"><ChevronLeft :size="14" /></button>
                    <small>{{ currentBranchPosition + 1 }}/{{ orderedBranches.length }}</small>
                    <button type="button" title="下一个分支" :disabled="store.isGenerating || currentBranchPosition >= orderedBranches.length - 1" @click="switchBranch(1)"><ChevronRight :size="14" /></button>
                  </span>
                  <button v-if="message.role === 'user'" type="button" title="编辑消息" :disabled="store.isGenerating" @click="$emit('start-edit')"><Pencil :size="15" /></button>
                  <template v-else>
                    <button type="button" title="重新生成" :disabled="store.isGenerating" @click="$emit('retry')"><RefreshCw :size="15" /></button>
                    <button type="button" title="有帮助" :class="{ 'is-active': message.feedback === 'UP' }" :aria-pressed="message.feedback === 'UP'" @click="setMessageFeedback('UP')"><ThumbsUp :size="15" /></button>
                    <button type="button" title="没有帮助" :class="{ 'is-active': message.feedback === 'DOWN' }" :aria-pressed="message.feedback === 'DOWN'" @click="setMessageFeedback('DOWN')"><ThumbsDown :size="15" /></button>
                  </template>
                </nav>
                <nav v-if="showFollowUps" class="message-follow-ups" aria-label="你可能还想问">
                  <button v-for="suggestion in followUps" :key="suggestion" type="button" :disabled="store.isGenerating" @click="$emit('follow-up', suggestion)">
                    <span>{{ suggestion }}</span><ArrowRight :size="15" />
                  </button>
                </nav>
              </template>
            </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, BookOpenCheck, BrainCircuit, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, LoaderCircle, Pencil, RefreshCw, Search, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-vue-next'
import ChatMessageContent from '../ChatMessageContent.vue'
import ModelBadge from '../common/ModelBadge.vue'
import { useStudioStore } from '../../stores/studio'
import { resolveChatResponseState } from '../../utils/chat-response-state'
import type { CodeArtifact, Message } from '../../types'

const props = defineProps<{
  message: Message
  highlight: boolean
  editing: boolean
  followUps: string[]
  showFollowUps: boolean
}>()
const emit = defineEmits<{
  (e: 'start-edit'): void
  (e: 'save-edit'): void
  (e: 'cancel-edit'): void
  (e: 'retry'): void
  (e: 'switch-branch', messageId: string): void
  (e: 'follow-up', value: string): void
  (e: 'preview-artifact', artifact: CodeArtifact): void
}>()
const editingMessageContent = defineModel<string>('editingContent', { required: true })

const store = useStudioStore()
const copied = ref(false)
const responseState = computed(() => resolveChatResponseState(props.message, {
  isGenerating: store.isGenerating,
  activeJobId: store.activeJobId,
}))
const orderedBranches = computed(() => [...(props.message.branches || [])].sort((left, right) => left.branchIndex - right.branchIndex))
const currentBranchPosition = computed(() => Math.max(0, orderedBranches.value.findIndex((branch) => branch.id === props.message.id)))

function sourceDomain(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value }
}
function copyMessage(message: { id: string; content: string }) {
  navigator.clipboard?.writeText(message.content).catch(() => undefined)
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1600)
}
async function setMessageFeedback(value: 'UP' | 'DOWN') {
  const nextValue = props.message.feedback === value ? null : value
  try { await store.setMessageFeedback(props.message.id, nextValue) }
  catch (reason) { store.lastError = reason instanceof Error ? reason.message : '反馈提交失败' }
}
function switchBranch(offset: -1 | 1) {
  const target = orderedBranches.value[currentBranchPosition.value + offset]
  if (target) emit('switch-branch', target.id)
}
</script>
