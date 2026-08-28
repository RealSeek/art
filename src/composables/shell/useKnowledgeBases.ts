import { reactive, ref, type Ref } from 'vue'
import { api } from '../../services/api'
import type { KnowledgeBase, KnowledgeDraft } from '../../components/shell/types'

export function useKnowledgeBases(state: { busy: Ref<boolean>; message: Ref<string>; error: Ref<boolean> }) {
  const knowledgeBases = ref<KnowledgeBase[]>([])
  const knowledgeDraft = reactive<KnowledgeDraft>({ name: '', description: '', teamId: '' })
  const knowledgeAssetSelection = reactive<Record<string, string>>({})
  const knowledgeTeamSelection = reactive<Record<string, string>>({})

  async function reloadKnowledgeBases() {
    knowledgeBases.value = await api<KnowledgeBase[]>('/knowledge-bases')
    knowledgeBases.value.forEach((item) => { knowledgeTeamSelection[item.id] = item.teamId || '' })
  }

  async function run(action: () => Promise<void>, failure: string) {
    state.busy.value = true
    try {
      await action()
      state.error.value = false
    } catch (reason) {
      state.error.value = true
      state.message.value = reason instanceof Error ? reason.message : failure
    } finally {
      state.busy.value = false
    }
  }

  async function createKnowledgeBase() {
    if (!knowledgeDraft.name.trim()) return
    state.message.value = ''
    await run(async () => {
      await api('/knowledge-bases', { method: 'POST', body: JSON.stringify({ ...knowledgeDraft, teamId: knowledgeDraft.teamId || null }) })
      Object.assign(knowledgeDraft, { name: '', description: '', teamId: '' })
      await reloadKnowledgeBases()
      state.message.value = '知识库已创建'
    }, '知识库创建失败')
  }

  async function editKnowledgeBase(item: KnowledgeBase) {
    const name = window.prompt('知识库名称', item.name)?.trim()
    if (!name) return
    const description = window.prompt('知识库说明', item.description)?.trim() ?? item.description
    await run(async () => {
      await api(`/knowledge-bases/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) })
      await reloadKnowledgeBases()
      state.message.value = '知识库已更新'
    }, '知识库更新失败')
  }

  async function deleteKnowledgeBase(item: KnowledgeBase) {
    if (!window.confirm(`永久删除知识库“${item.name}”？文件本身不会被删除。`)) return
    await run(async () => {
      await api(`/knowledge-bases/${item.id}`, { method: 'DELETE' })
      await reloadKnowledgeBases()
      state.message.value = '知识库已删除'
    }, '知识库删除失败')
  }

  async function assignKnowledgeBaseTeam(item: KnowledgeBase) {
    const teamId = knowledgeTeamSelection[item.id] ?? item.teamId ?? ''
    await run(async () => {
      await api(`/knowledge-bases/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: item.name, description: item.description, teamId: teamId || null }) })
      await reloadKnowledgeBases()
      state.message.value = teamId ? '知识库已共享到团队' : '知识库已设为个人资料'
    }, '知识库归属更新失败')
  }

  async function attachKnowledgeAsset(knowledgeBaseId: string) {
    const assetId = knowledgeAssetSelection[knowledgeBaseId]
    if (!assetId) return
    await run(async () => {
      await api(`/knowledge-bases/${knowledgeBaseId}/assets`, { method: 'POST', body: JSON.stringify({ assetId }) })
      knowledgeAssetSelection[knowledgeBaseId] = ''
      await reloadKnowledgeBases()
      state.message.value = '文件已加入知识库'
    }, '文件添加失败')
  }

  async function detachKnowledgeAsset(knowledgeBaseId: string, assetId: string) {
    await run(async () => {
      await api(`/knowledge-bases/${knowledgeBaseId}/assets/${assetId}`, { method: 'DELETE' })
      await reloadKnowledgeBases()
      state.message.value = '文件已从知识库移除'
    }, '文件移除失败')
  }

  return {
    knowledgeBases, knowledgeDraft, knowledgeAssetSelection, knowledgeTeamSelection,
    reloadKnowledgeBases, createKnowledgeBase, editKnowledgeBase, deleteKnowledgeBase,
    assignKnowledgeBaseTeam, attachKnowledgeAsset, detachKnowledgeAsset
  }
}
