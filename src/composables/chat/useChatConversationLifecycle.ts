import { watch, type Ref } from 'vue'
import type { GenerationRun, Message, StudioMode } from '../../types'
import { catalogModelKey, type CatalogModel } from '../../utils/model-catalog'

interface ConversationModel {
  id: string
  model?: string | null
}

interface AssistantModel {
  id: string
  defaultModel?: string
}

interface ChatConversationLifecycleOptions {
  activeMode: Readonly<Ref<StudioMode>>
  model: Ref<string>
  catalogModels: Readonly<Ref<CatalogModel[]>>
  assistantId: Readonly<Ref<string>>
  assistants: Readonly<Ref<AssistantModel[]>>
  currentConversationId: () => string
  openingConversationId: () => string
  conversations: () => ConversationModel[]
  generations: () => GenerationRun[]
  messages: () => Message[]
  isGenerating: () => boolean
  clearArtifact: () => void
  scrollThreadToBottom: (behavior?: ScrollBehavior) => Promise<void>
}

export function useChatConversationLifecycle(options: ChatConversationLifecycleOptions) {
  watch(options.currentConversationId, () => {
    const conversation = options.conversations().find((item) => item.id === options.currentConversationId())
    if (conversation?.model) {
      options.model.value = catalogModelKey(options.catalogModels.value, conversation.model, 'CHAT')
    }
    options.clearArtifact()
  })

  watch(options.openingConversationId, (conversationId, previousConversationId) => {
    if (conversationId || !previousConversationId || options.currentConversationId() !== previousConversationId) return
    void options.scrollThreadToBottom('auto')
  })

  watch(options.assistantId, (id) => {
    const assistant = options.assistants.value.find((item) => item.id === id)
    if (assistant?.defaultModel) {
      options.model.value = catalogModelKey(options.catalogModels.value, assistant.defaultModel, 'CHAT')
    }
  })

  watch(
    () => options.generations().map((generation) => `${generation.id}:${generation.status}:${generation.assets.length}`).join('|'),
    () => {
      if (options.activeMode.value === 'chat') void options.scrollThreadToBottom()
    },
  )

  watch(
    () => options.messages().map((message) => `${message.id}:${message.content.length}`).join('|'),
    () => {
      if (options.activeMode.value === 'chat' && options.isGenerating()) {
        void options.scrollThreadToBottom('auto')
      }
    },
  )
}
