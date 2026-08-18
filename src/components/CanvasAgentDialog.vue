<template>
  <div class="canvas-modal-backdrop canvas-agent-backdrop" @click.self="close">
    <section class="canvas-agent-dialog" role="dialog" aria-modal="true" aria-labelledby="canvas-agent-title">
      <header>
        <div><span>CANVAS AGENT</span><h2 id="canvas-agent-title">让 Agent 整理当前画布</h2><p>Agent 只生成操作计划，确认后才会修改节点。</p></div>
        <button type="button" aria-label="关闭画布 Agent" @click="close"><X :size="19" /></button>
      </header>

      <div v-if="!result" class="canvas-agent-form">
        <label>任务目标<textarea v-model="goal" maxlength="4000" rows="6" placeholder="例如：把这些产品资料整理成三套视觉方向，并为每套创建图片生成节点。" /></label>
        <div class="canvas-agent-options">
          <div class="canvas-agent-model-field">
            <span>Agent 模型</span>
            <button ref="modelTrigger" type="button" class="canvas-agent-model-trigger" :aria-expanded="modelPickerOpen" @click="toggleModelPicker">
              <Bot :size="15" /><strong>{{ selectedModel?.displayName || '选择可用模型' }}</strong><ChevronDown :size="14" />
            </button>
          </div>
          <label class="canvas-agent-web-toggle"><input v-model="webSearchEnabled" type="checkbox" /><span><Globe2 :size="16" /><strong>联网搜索</strong><small>需要外部资料时允许检索网页</small></span></label>
        </div>
        <div class="canvas-agent-context"><span><Network :size="15" />{{ document.nodes.length }} 个节点 · {{ document.edges.length }} 条连接</span><span><Paperclip :size="15" />{{ attachmentIds.length }} 个素材附件</span></div>
        <p v-if="error" class="canvas-agent-error" role="alert">{{ error }}</p>
      </div>

      <div v-else class="canvas-agent-result">
        <div class="canvas-agent-summary"><CheckCircle2 :size="20" /><div><strong>{{ result.summary || '操作计划已生成' }}</strong><span>{{ result.operations.length }} 项变更等待确认</span></div></div>
        <ol v-if="result.operations.length" class="canvas-agent-operation-list">
          <li v-for="(operation, index) in result.operations" :key="`${operation.type}-${index}`"><span>{{ index + 1 }}</span><div><strong>{{ operationLabel(operation) }}</strong><small>{{ operationDetail(operation) }}</small></div></li>
        </ol>
        <div v-else class="canvas-agent-empty"><CircleAlert :size="22" /><strong>Agent 没有返回可执行变更</strong><span>可以返回修改目标后重新运行。</span></div>
        <p v-if="error" class="canvas-agent-error" role="alert">{{ error }}</p>
      </div>

      <section v-if="task" class="canvas-agent-runtime">
        <div><LoaderCircle v-if="running" class="canvas-spin" :size="16" /><Bot v-else :size="16" /><strong>{{ statusLabel }}</strong><span v-if="task.agentRun">第 {{ task.agentRun.iteration + 1 }} 轮 · {{ task.agentRun.creditCost }} 点</span></div>
        <ol v-if="task.steps?.length"><li v-for="step in task.steps" :key="step.id" :data-status="step.status"><i /><span>{{ step.title }}</span></li></ol>
      </section>

      <footer>
        <button v-if="running" type="button" @click="cancelTask">停止</button>
        <button v-else type="button" @click="result ? reset() : close()">{{ result ? '重新设置' : '取消' }}</button>
        <button v-if="!result" class="is-primary" type="button" :disabled="running || !goal.trim() || !model" @click="runAgent"><Sparkles :size="16" />{{ running ? 'Agent 执行中' : '生成操作计划' }}</button>
        <button v-else class="is-primary" type="button" :disabled="!result.operations.length" @click="apply"><Check :size="16" />应用 {{ result.operations.length }} 项变更</button>
      </footer>
    </section>
    <Teleport to="body">
      <div v-if="modelPickerOpen" class="canvas-agent-model-picker canvas-agent-model-picker--floating" :style="modelPickerStyle" @click.stop>
        <ModelCatalogPicker v-model="model" :models="agentModels" title="选择 Agent 模型" description-mode="agent" @select="modelPickerOpen = false" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Bot, Check, CheckCircle2, ChevronDown, CircleAlert, Globe2, LoaderCircle, Network, Paperclip, Sparkles, X } from 'lucide-vue-next'
import { api, streamApiEvents } from '../services/api'
import type { CanvasAgentOperation, CanvasAgentOperationType, CanvasDocumentPayload } from '../types/canvas'
import { isAgentModelEligible, type CatalogModel } from '../utils/model-catalog'
import ModelCatalogPicker from './ModelCatalogPicker.vue'

type AgentStep = { id: string; title: string; status: string }
type AgentTask = { id: string; status: string; errorMessage?: string | null; steps: AgentStep[]; agentRun?: { iteration: number; creditCost: number; finalAnswer?: string } | null }
type AgentResult = { summary: string; operations: CanvasAgentOperation[] }

const props = withDefaults(defineProps<{ canvasId: string; canvasTitle: string; projectId?: string; document: CanvasDocumentPayload; models: CatalogModel[]; initialGoal?: string }>(), { initialGoal: '' })
const emit = defineEmits<{ close: []; apply: [operations: CanvasAgentOperation[]] }>()
const allowedTypes = new Set<CanvasAgentOperationType>(['add_text', 'add_image', 'add_video', 'update_node', 'connect_nodes', 'move_node', 'delete_node', 'run_generation'])
const agentModels = computed(() => props.models.filter(isAgentModelEligible))
const goal = ref(props.initialGoal)
const model = ref(agentModels.value.find((item) => item.isDefault)?.key || agentModels.value[0]?.key || '')
const modelPickerOpen = ref(false)
const modelTrigger = ref<HTMLButtonElement | null>(null)
const modelPickerStyle = ref({ top: '12px', left: '12px' })
const selectedModel = computed(() => agentModels.value.find((item) => item.key === model.value))
const webSearchEnabled = ref(true)
const running = ref(false)
const error = ref('')
const task = ref<AgentTask | null>(null)
const result = ref<AgentResult | null>(null)
const attachmentIds = computed(() => [...new Set(props.document.nodes.flatMap((node) => node.data.assetId ? [node.data.assetId] : []))].slice(0, 20))
const statusLabel = computed(() => ({ DRAFT: '准备任务', QUEUED: '等待执行', RUNNING: '正在分析画布', WAITING_APPROVAL: '等待审批', SUCCEEDED: '计划已完成', PARTIAL: '计划部分完成', FAILED: '执行失败', CANCELLED: '已停止' } as Record<string, string>)[task.value?.status || 'DRAFT'] || '处理中')

async function toggleModelPicker() {
  modelPickerOpen.value = !modelPickerOpen.value
  if (!modelPickerOpen.value) return
  await nextTick()
  const trigger = modelTrigger.value?.getBoundingClientRect()
  if (!trigger) return
  const width = Math.min(704, Math.max(280, window.innerWidth - 24))
  const estimatedHeight = Math.min(560, Math.max(320, window.innerHeight - 24))
  const left = Math.max(12, Math.min(trigger.right - width, window.innerWidth - width - 12))
  const below = trigger.bottom + 8
  const top = below + estimatedHeight <= window.innerHeight - 12
    ? below
    : Math.max(12, trigger.top - estimatedHeight - 8)
  modelPickerStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
}

async function runAgent() {
  if (!goal.value.trim() || !model.value || running.value) return
  modelPickerOpen.value = false
  running.value = true
  error.value = ''
  result.value = null
  try {
    const created = await api<AgentTask>('/agent-tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: `画布 Agent · ${props.canvasTitle}`.slice(0, 120),
        goal: goal.value.trim(),
        model: model.value,
        projectId: props.projectId || undefined,
        attachmentIds: attachmentIds.value,
        webSearchEnabled: webSearchEnabled.value,
        instructions: agentInstructions(),
      }),
    })
    task.value = created
    task.value = await api<AgentTask>(`/agent-tasks/${created.id}/run`, { method: 'POST' })
    const completed = await streamApiEvents<AgentTask>(`/agent-tasks/${created.id}/events`, (current) => { task.value = current })
    task.value = completed
    if (!['SUCCEEDED', 'PARTIAL'].includes(completed.status)) throw new Error(completed.errorMessage || 'Agent 未能完成画布分析')
    result.value = parseResult(completed.agentRun?.finalAnswer || '')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '画布 Agent 执行失败'
  } finally { running.value = false }
}

function agentInstructions() {
  const compact = {
    canvasId: props.canvasId,
    kind: props.document.nodes.some((node) => node.data.dramaStage) ? 'SHORT_DRAMA' : 'FREEFORM',
    nodes: props.document.nodes.slice(0, 100).map((node) => ({ id: node.id, type: node.type, title: node.title, content: node.data.content?.slice(0, 1200) || '', prompt: node.data.prompt?.slice(0, 800) || '', x: Math.round(node.position.x), y: Math.round(node.position.y), dramaRole: node.data.dramaRole, shotId: node.data.shotId })),
    edges: props.document.edges.slice(0, 200).map(({ source, target, label }) => ({ source, target, label })),
  }
  return `你正在为 Xinyue AI 无限画布制定变更计划。只在最终答案输出一个 JSON 对象，不要 Markdown、解释或代码围栏。\n格式：{"summary":"一句话摘要","operations":[{"type":"add_text|add_image|add_video|update_node|connect_nodes|move_node|delete_node|run_generation","tempId":"新增节点临时 ID","nodeId":"已有节点或临时 ID","source":"源节点 ID","target":"目标节点 ID","title":"标题","content":"文本内容","prompt":"生成提示词","x":0,"y":0}]}。\n规则：最多 20 项；不得引用不存在的已有节点；新增节点必须有唯一 tempId；生成媒体应先创建或更新提示词并正确连接；只有用户明确要求时才能 delete_node 或 run_generation；不要编造已生成的图片或视频。\n当前画布：${JSON.stringify(compact).slice(0, 15000)}`
}

function parseResult(answer: string): AgentResult {
  const source = answer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Agent 返回的操作计划格式不正确，请调整目标后重试')
  const parsed = JSON.parse(source.slice(start, end + 1)) as { summary?: unknown; operations?: unknown }
  const operations = Array.isArray(parsed.operations) ? parsed.operations.slice(0, 20).flatMap((value) => normalizeOperation(value)) : []
  return { summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '', operations }
}

function normalizeOperation(value: unknown): CanvasAgentOperation[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const raw = value as Record<string, unknown>
  const type = String(raw.type || '') as CanvasAgentOperationType
  if (!allowedTypes.has(type)) return []
  const text = (key: string, max = 4000) => typeof raw[key] === 'string' ? String(raw[key]).trim().slice(0, max) || undefined : undefined
  const number = (key: string) => typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? Math.max(-1_000_000, Math.min(1_000_000, raw[key])) : undefined
  return [{ type, tempId: text('tempId', 100), nodeId: text('nodeId', 100), source: text('source', 100), target: text('target', 100), title: text('title', 120), content: text('content'), prompt: text('prompt'), x: number('x'), y: number('y') }]
}

async function cancelTask() {
  if (!task.value || !running.value) return
  try { task.value = await api<AgentTask>(`/agent-tasks/${task.value.id}/cancel`, { method: 'POST' }) }
  finally { running.value = false }
}

function apply() { if (result.value?.operations.length) emit('apply', result.value.operations) }
function close() { if (!running.value) { modelPickerOpen.value = false; emit('close') } }
function reset() { modelPickerOpen.value = false; result.value = null; task.value = null; error.value = '' }
function operationLabel(operation: CanvasAgentOperation) { return ({ add_text: '新增文本节点', add_image: '新增图片节点', add_video: '新增视频节点', update_node: '更新节点', connect_nodes: '连接节点', move_node: '移动节点', delete_node: '删除节点', run_generation: '执行生成' } as Record<CanvasAgentOperationType, string>)[operation.type] }
function operationDetail(operation: CanvasAgentOperation) { return operation.title || operation.content?.slice(0, 90) || operation.prompt?.slice(0, 90) || [operation.source, operation.target].filter(Boolean).join(' → ') || operation.nodeId || operation.tempId || '按当前画布上下文执行' }
</script>
