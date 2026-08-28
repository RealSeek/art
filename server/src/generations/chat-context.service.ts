import { Injectable } from '@nestjs/common'
import { TokenizerService } from '../billing/tokenizer.service'

export type ChatContextMessage = { role: string; content: string }
export type BranchContextMessage = ChatContextMessage & { id: string; parentId?: string | null }

@Injectable()
export class ChatContextService {
  constructor(private readonly tokenizer: TokenizerService) {}

  /** Select the newest message suffix that fits the model's input budget. */
  select<T extends ChatContextMessage>(messages: T[], model: string, options: Record<string, unknown> = {}): T[] {
    const rawWindow = Number(options.contextWindow ?? options.context_window ?? 0)
    const contextWindow = Number.isFinite(rawWindow) && rawWindow >= 4096 ? Math.min(Math.trunc(rawWindow), 256_000) : 32_768
    const outputReserve = Math.max(1024, Number(options.maxOutputTokens || 4096))
    const budget = Math.max(2048, contextWindow - outputReserve - 2048)
    const selected: T[] = []
    let used = 0
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      const cost = this.tokenizer.estimateMessages([message], model)
      if (selected.length > 0 && used + cost > budget) break
      selected.unshift(message)
      used += cost
    }
    return selected
  }

  /** Resolve one active root-to-leaf path; legacy parentless rows stay linear. */
  activePath<T extends BranchContextMessage>(messages: T[], activeLeafId?: string | null): T[] {
    if (!activeLeafId) return messages
    const byId = new Map(messages.map((message) => [message.id, message]))
    const ids = new Set<string>()
    let cursor = byId.get(activeLeafId)
    while (cursor && !ids.has(cursor.id)) {
      ids.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    return ids.size ? messages.filter((message) => ids.has(message.id)) : messages
  }
}
