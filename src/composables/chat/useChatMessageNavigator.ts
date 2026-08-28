import { computed, nextTick, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import type { Message } from '../../types'

interface ChatMessageNavigatorOptions {
  messages: ComputedRef<Message[]>
  thread: ComputedRef<HTMLElement | null>
  conversationId: () => string
}

export function useChatMessageNavigator(options: ChatMessageNavigatorOptions) {
  const messageNavigatorOpen = ref(false)
  const activeMessageJumpId = ref('')
  const jumpHighlightId = ref('')
  const messageJumps = computed(() => options.messages.value.filter((message) => message.role === 'user'))
  let jumpHighlightTimer = 0
  let navigatorCloseTimer = 0

  function compactMessageJump(content: string) {
    return content.replace(/\s+/g, ' ').trim().slice(0, 76)
  }

  function openMessageNavigator() {
    window.clearTimeout(navigatorCloseTimer)
    messageNavigatorOpen.value = true
  }

  function scheduleMessageNavigatorClose() {
    window.clearTimeout(navigatorCloseTimer)
    navigatorCloseTimer = window.setTimeout(() => { messageNavigatorOpen.value = false }, 220)
  }

  function closeMessageNavigatorOnBlur(event: FocusEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      messageNavigatorOpen.value = false
    }
  }

  function syncMessageNavigator() {
    const container = options.thread.value
    if (!container || !messageJumps.value.length) return
    const anchor = container.getBoundingClientRect().top + Math.min(120, container.clientHeight * 0.28)
    const elements = [...container.querySelectorAll<HTMLElement>('[data-user-message="true"]')]
    const nearest = elements.reduce<{ id: string; distance: number } | null>((best, element) => {
      const id = element.dataset.messageId || ''
      const distance = Math.abs(element.getBoundingClientRect().top - anchor)
      return id && (!best || distance < best.distance) ? { id, distance } : best
    }, null)
    if (nearest) activeMessageJumpId.value = nearest.id
  }

  function jumpToMessage(messageId: string) {
    const elements = options.thread.value?.querySelectorAll<HTMLElement>('[data-user-message="true"]') || []
    const target = [...elements].find((element) => element.dataset.messageId === messageId)
    if (!target) return
    activeMessageJumpId.value = messageId
    messageNavigatorOpen.value = false
    jumpHighlightId.value = messageId
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.clearTimeout(jumpHighlightTimer)
    jumpHighlightTimer = window.setTimeout(() => {
      if (jumpHighlightId.value === messageId) jumpHighlightId.value = ''
    }, 1400)
  }

  async function scrollThreadToBottom(behavior: ScrollBehavior = 'smooth') {
    await nextTick()
    const container = options.thread.value
    container?.scrollTo({ top: container.scrollHeight, behavior })
  }

  function resetNavigator() {
    messageNavigatorOpen.value = false
    jumpHighlightId.value = ''
    void nextTick(syncMessageNavigator)
  }

  watch(options.conversationId, resetNavigator)
  watch(messageJumps, (messages) => {
    if (!messages.some((message) => message.id === activeMessageJumpId.value)) {
      activeMessageJumpId.value = messages.at(-1)?.id || ''
    }
    void nextTick(syncMessageNavigator)
  })

  onUnmounted(() => {
    window.clearTimeout(jumpHighlightTimer)
    window.clearTimeout(navigatorCloseTimer)
  })

  return {
    messageJumps,
    messageNavigatorOpen,
    activeMessageJumpId,
    jumpHighlightId,
    compactMessageJump,
    openMessageNavigator,
    scheduleMessageNavigatorClose,
    closeMessageNavigatorOnBlur,
    syncMessageNavigator,
    jumpToMessage,
    scrollThreadToBottom,
  }
}
