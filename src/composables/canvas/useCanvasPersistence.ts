import { computed, onBeforeUnmount, watch, type Ref } from 'vue'

export type CanvasSaveState = 'saved' | 'dirty' | 'saving' | 'error'

interface CanvasPersistenceState<TDocument> {
  title: Ref<string>
  revision: Ref<number>
  hydrated: Readonly<Ref<boolean>>
  dirty: Ref<boolean>
  loadError: Readonly<Ref<string>>
  saveState: Ref<CanvasSaveState>
  saveError: Ref<string>
  documentState: () => unknown
  serializeDocument: () => TDocument
}

interface CanvasPersistenceActions<TDocument> {
  isApplyingHistory: () => boolean
  saveRecord: (input: { expectedRevision: number; title: string; document: TDocument }) => Promise<{ revision: number }>
}

export function useCanvasPersistence<TDocument>(
  state: CanvasPersistenceState<TDocument>,
  actions: CanvasPersistenceActions<TDocument>,
) {
  let saveTimer = 0
  let saving = false
  let savePending = false

  const saveLabel = computed(() => state.saveState.value === 'saving'
    ? '保存中'
    : state.saveState.value === 'dirty'
      ? '未保存'
      : state.saveState.value === 'error'
        ? state.saveError.value || '保存失败'
        : '已保存')

  function scheduleSave() {
    if (!state.hydrated.value) return
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void saveNow(), 900)
  }

  function markDirty() {
    if (!state.hydrated.value || actions.isApplyingHistory()) return
    state.dirty.value = true
    state.saveState.value = 'dirty'
    scheduleSave()
  }

  async function saveNow() {
    window.clearTimeout(saveTimer)
    if (!state.dirty.value || state.loadError.value) return
    if (saving) {
      savePending = true
      return
    }
    saving = true
    state.saveState.value = 'saving'
    const savedDocument = state.serializeDocument()
    const savedTitle = state.title.value.trim() || '未命名画布'
    try {
      const record = await actions.saveRecord({
        expectedRevision: state.revision.value,
        title: savedTitle,
        document: savedDocument,
      })
      state.revision.value = record.revision
      state.dirty.value = JSON.stringify(savedDocument) !== JSON.stringify(state.serializeDocument())
        || savedTitle !== (state.title.value.trim() || '未命名画布')
      state.saveState.value = state.dirty.value ? 'dirty' : 'saved'
      state.saveError.value = ''
    } catch (reason) {
      state.saveState.value = 'error'
      state.saveError.value = reason instanceof Error ? reason.message : '保存失败'
    } finally {
      saving = false
      if (savePending || state.dirty.value && state.saveState.value !== 'error') {
        savePending = false
        scheduleSave()
      }
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (state.dirty.value) event.preventDefault()
  }

  watch(state.documentState, markDirty, { deep: true })
  watch(state.title, markDirty)
  onBeforeUnmount(() => window.clearTimeout(saveTimer))

  return { saveLabel, scheduleSave, saveNow, handleBeforeUnload }
}
