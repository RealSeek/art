import { computed, ref, type Ref } from 'vue'
import type { StudioAsset, StudioMode } from '../../types'

export type StudioFilePurpose = 'chat-file' | 'creation' | 'mask' | 'audio' | 'library'
type StudioUploadPurpose = 'attachment' | 'reference' | 'mask' | 'library'
type StudioUploadKind = 'IMAGE' | 'FILE' | 'AUDIO'

interface StudioFileUploadState {
  activeMode: Readonly<Ref<StudioMode>>
  chatAttachments: Ref<StudioAsset[]>
  creationAttachments: Ref<StudioAsset[]>
  audioAttachments: Ref<StudioAsset[]>
  maskAttachment: Ref<StudioAsset | null>
}

interface StudioFileUploadActions {
  requireAuth: (redirect: string) => boolean
  currentProjectId: () => string
  uploadFiles: (files: File[], kind: StudioUploadKind | undefined, projectId: string | undefined, purpose: StudioUploadPurpose) => Promise<StudioAsset[]>
  closeComposerPopovers: () => void
  closeNewMenu: () => void
  clearError: () => void
  setError: (message: string) => void
}

export function studioFileRedirect(mode: StudioMode) {
  if (mode === 'assets') return '/workspace?tab=files'
  if (mode === 'commerce') return '/commerce'
  if (mode === 'images') return '/image'
  if (mode === 'videos') return '/video'
  return '/chat'
}

export function studioFileRequest(purpose: StudioFilePurpose): { kind: StudioUploadKind | undefined; purpose: StudioUploadPurpose } {
  if (purpose === 'creation') return { kind: 'IMAGE' as const, purpose: 'reference' }
  if (purpose === 'mask') return { kind: 'IMAGE' as const, purpose: 'mask' }
  if (purpose === 'audio') return { kind: 'AUDIO' as const, purpose: 'reference' }
  if (purpose === 'chat-file') return { kind: undefined, purpose: 'attachment' }
  return { kind: undefined, purpose: 'library' }
}

export function useStudioFileUpload(state: StudioFileUploadState, actions: StudioFileUploadActions) {
  const fileInput = ref<HTMLInputElement | null>(null)
  const filePurpose = ref<StudioFilePurpose>('chat-file')
  const uploading = ref(false)
  const fileAccept = computed(() => filePurpose.value === 'creation' || filePurpose.value === 'mask' ? 'image/*' : filePurpose.value === 'audio' ? 'audio/*' : '*/*')

  function setFileInput(element: unknown) {
    fileInput.value = element instanceof HTMLInputElement ? element : null
  }

  function openFilePicker(purpose: StudioFilePurpose) {
    if (!actions.requireAuth(studioFileRedirect(state.activeMode.value))) return
    filePurpose.value = purpose
    actions.closeComposerPopovers()
    actions.closeNewMenu()
    if (!fileInput.value) return
    fileInput.value.value = ''
    fileInput.value.click()
  }

  async function handleFiles(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files || [])
    if (!files.length) return
    uploading.value = true
    actions.clearError()
    try {
      const request = studioFileRequest(filePurpose.value)
      const uploaded = await actions.uploadFiles(
        files,
        request.kind,
        actions.currentProjectId() || undefined,
        request.purpose,
      )
      if (filePurpose.value === 'chat-file') state.chatAttachments.value.push(...uploaded)
      else if (filePurpose.value === 'creation') state.creationAttachments.value.push(...uploaded)
      else if (filePurpose.value === 'audio') state.audioAttachments.value.push(...uploaded)
      else if (filePurpose.value === 'mask') state.maskAttachment.value = uploaded[0] || null
    } catch (reason) {
      actions.setError(reason instanceof Error ? reason.message : '文件上传失败')
    } finally {
      uploading.value = false
    }
  }

  return { fileAccept, uploading, setFileInput, openFilePicker, handleFiles }
}
