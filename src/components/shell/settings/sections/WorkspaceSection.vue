<template>
  <h2 id="settings-workspace">知识与工具</h2>
  <p class="settings-section-intro">管理助手可检索的资料，以及需要管理员审批的外部工具权限。</p>
  <section class="settings-workspace-section">
    <header><div><strong>我的知识库</strong><small>文本和 JSON 文件会自动提取内容，图片等文件保留为资料索引。</small></div><BookOpen :size="19" /></header>
    <form class="settings-knowledge-create" @submit.prevent="createKnowledgeBase"><input v-model.trim="knowledgeDraft.name" required maxlength="100" placeholder="知识库名称" /><input v-model.trim="knowledgeDraft.description" maxlength="2000" placeholder="用途说明（可选）" /><select v-model="knowledgeDraft.teamId" aria-label="知识库归属"><option value="">个人知识库</option><option v-for="team in manageableTeams" :key="team.id" :value="team.id">{{ team.name }}</option></select><button type="submit" :disabled="workspaceBusy"><CirclePlus :size="15" />创建</button></form>
    <div class="settings-knowledge-list">
      <article v-for="item in knowledgeBases" :key="item.id">
        <header><div><strong>{{ item.name }}</strong><small>{{ item.description || '暂无说明' }} · {{ item.team?.name || '个人知识库' }}</small></div><span>{{ item.documentCount }} 个文件 · {{ item.chunkCount }} 个分块</span></header>
        <div v-if="item.assets.length" class="settings-knowledge-assets"><div v-for="entry in item.assets" :key="entry.assetId"><span><FileText :size="15" />{{ entry.asset.name }}</span><button type="button" aria-label="从知识库移除文件" @click="detachKnowledgeAsset(item.id, entry.assetId)"><X :size="14" /></button></div></div>
        <p v-else>还没有关联文件。</p>
        <footer><select :value="knowledgeAssetSelection[item.id] || ''" :aria-label="`为${item.name}选择文件`" @change="knowledgeAssetSelection[item.id] = ($event.target as HTMLSelectElement).value"><option value="">选择已上传文件</option><option v-for="asset in availableKnowledgeAssets(item)" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select><button type="button" :disabled="!knowledgeAssetSelection[item.id] || workspaceBusy" @click="attachKnowledgeAsset(item.id)">添加文件</button><select v-if="item.creator?.id === auth.session?.id || manageableTeams.some((team) => team.id === item.teamId)" v-model="knowledgeTeamSelection[item.id]" :aria-label="`${item.name}归属`"><option value="">个人</option><option v-for="team in manageableTeams" :key="team.id" :value="team.id">{{ team.name }}</option></select><button v-if="item.creator?.id === auth.session?.id || manageableTeams.some((team) => team.id === item.teamId)" type="button" :disabled="workspaceBusy || knowledgeTeamSelection[item.id] === (item.teamId || '')" @click="assignKnowledgeBaseTeam(item)">调整归属</button><button type="button" @click="editKnowledgeBase(item)"><Pencil :size="14" />编辑</button><button class="danger-button" type="button" @click="deleteKnowledgeBase(item)"><Trash2 :size="14" />删除</button></footer>
      </article>
      <p v-if="!knowledgeBases.length" class="settings-empty-copy">尚未创建知识库。创建后可绑定资料并在后台关联到 AI 助手。</p>
    </div>
  </section>
  <section class="settings-workspace-section">
    <header><div><strong>工具权限</strong><small>需要审批的工具会生成正式申请，批准后在有效期内可调用一次。</small></div><Wrench :size="19" /></header>
    <div class="settings-tool-list"><article v-for="binding in assistantToolBindings" :key="binding.key"><div><strong>{{ binding.tool.name }}</strong><small>{{ binding.assistant.name }} · {{ binding.tool.description || binding.tool.key }}</small></div><span :class="`status-${binding.approval?.status?.toLowerCase() || 'none'}`">{{ toolApprovalText(binding) }}</span><button v-if="binding.tool.requiresApproval && !['PENDING', 'APPROVED'].includes(binding.approval?.status || '')" type="button" :disabled="workspaceBusy" @click="requestToolApproval(binding)">申请权限</button><button v-else-if="binding.tool.requiresApproval && binding.approval?.status === 'PENDING'" class="subtle-button" type="button" :disabled="workspaceBusy" @click="cancelToolApproval(binding)">撤回申请</button><em v-else-if="!binding.tool.requiresApproval">无需审批</em></article><p v-if="!assistantToolBindings.length" class="settings-empty-copy">管理员启用并绑定工具后会显示在这里。</p></div>
  </section>
  <small v-if="workspaceMessage" class="settings-feedback" :class="{ 'is-error': workspaceError }">{{ workspaceMessage }}</small>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen, CirclePlus, FileText, Pencil, Trash2, Wrench, X } from 'lucide-vue-next'
import { useAuthStore } from '../../../../stores/auth'
import { formatServerDate } from '../../format'
import type {
  AssistantToolBinding,
  KnowledgeBase,
  KnowledgeDraft,
  Team,
  ToolApproval,
  WorkspaceAsset,
  WorkspaceAssistant,
} from '../../types'

const props = defineProps<{
  knowledgeDraft: KnowledgeDraft
  teams: Team[]
  workspaceBusy: boolean
  knowledgeBases: KnowledgeBase[]
  workspaceAssets: WorkspaceAsset[]
  knowledgeAssetSelection: Record<string, string>
  knowledgeTeamSelection: Record<string, string>
  workspaceTools: AssistantToolBinding['tool'][]
  workspaceAssistants: WorkspaceAssistant[]
  toolApprovals: ToolApproval[]
  workspaceMessage: string
  workspaceError: boolean
  createKnowledgeBase: () => Promise<void>
  detachKnowledgeAsset: (knowledgeBaseId: string, assetId: string) => Promise<void>
  attachKnowledgeAsset: (knowledgeBaseId: string) => Promise<void>
  assignKnowledgeBaseTeam: (item: KnowledgeBase) => Promise<void>
  editKnowledgeBase: (item: KnowledgeBase) => Promise<void>
  deleteKnowledgeBase: (item: KnowledgeBase) => Promise<void>
  requestToolApproval: (binding: AssistantToolBinding) => Promise<void>
  cancelToolApproval: (binding: AssistantToolBinding) => Promise<void>
}>()

const auth = useAuthStore()

const manageableTeams = computed(() => props.teams.filter((team) => team.ownerId === auth.session?.id || team.members.some((member) => member.userId === auth.session?.id && member.role === 'ADMIN')))

function availableKnowledgeAssets(item: KnowledgeBase) {
  const attached = new Set(item.assets.map((entry) => entry.assetId))
  return props.workspaceAssets.filter((asset) => !attached.has(asset.id) && (item.teamId ? asset.teamId === item.teamId : !asset.teamId))
}

const assistantToolBindings = computed<AssistantToolBinding[]>(() => {
  const bindings: AssistantToolBinding[] = []
  for (const assistant of props.workspaceAssistants) {
    for (const item of assistant.tools || []) {
      const tool = props.workspaceTools.find((entry) => entry.id === item.toolId)
      if (!tool) continue
      const approval = props.toolApprovals.find((entry) => entry.tool.id === tool.id && entry.assistant?.id === assistant.id)
      bindings.push({ key: `${assistant.id}:${tool.id}`, assistant: { id: assistant.id, name: assistant.name }, tool, approval })
    }
  }
  return bindings
})

function toolApprovalText(binding: AssistantToolBinding) {
  if (!binding.tool.requiresApproval) return '可直接使用'
  return ({ PENDING: '等待审批', APPROVED: binding.approval?.expiresAt ? `已批准至 ${formatServerDate(binding.approval.expiresAt)}` : '已批准', REJECTED: '已拒绝' } as Record<string, string>)[binding.approval?.status || ''] || '未申请'
}
</script>
