import { Injectable } from '@nestjs/common'
import { encodingForModel, getEncoding } from 'js-tiktoken'

type TokenEncoding = { encode(value: string): number[]; free?: () => void }

@Injectable()
export class TokenizerService {
  estimateText(value: unknown, model?: string) {
    if (!value) return 0
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    if (!text) return 0
    const encoding = this.encoding(model)
    try {
      return encoding.encode(text).length
    } finally {
      encoding.free?.()
    }
  }

  estimateMessages(messages: Array<{ role?: string; content?: unknown }>, model?: string) {
    const encoding = this.encoding(model)
    try {
      return messages.reduce((total, message) => {
        const role = typeof message.role === 'string' ? message.role : 'user'
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '')
        return total + encoding.encode(`${role}\n${content || ''}`).length + 4
      }, 2)
    } finally {
      encoding.free?.()
    }
  }

  private encoding(model?: string): TokenEncoding {
    try {
      return encodingForModel((model || 'gpt-4o') as Parameters<typeof encodingForModel>[0]) as unknown as TokenEncoding
    } catch {
      return getEncoding('cl100k_base') as unknown as TokenEncoding
    }
  }
}
