import { ChatUsage, normalizeChatUsage } from '../generations/chat-usage'
import { TokenUsageSource } from '@prisma/client'

export type NormalizedTokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningTokens: number
  source: TokenUsageSource
}

export function normalizeUsage(protocol: 'openai' | 'anthropic' | 'gemini', raw: unknown, estimated?: { inputTokens?: number; outputTokens?: number }): NormalizedTokenUsage {
  const usage: ChatUsage | undefined = normalizeChatUsage(protocol, raw)
  if (usage) {
    return {
      inputTokens: Math.max(0, Math.trunc(usage.prompt_tokens || 0)),
      outputTokens: Math.max(0, Math.trunc(usage.completion_tokens || 0)),
      totalTokens: Math.max(0, Math.trunc(usage.prompt_tokens || 0)) + Math.max(0, Math.trunc(usage.completion_tokens || 0)),
      cachedInputTokens: Math.max(0, Math.trunc(usage.cached_input_tokens || 0)),
      reasoningTokens: Math.max(0, Math.trunc(usage.reasoning_tokens || 0)),
      source: TokenUsageSource.PROVIDER,
    }
  }
  return {
    inputTokens: Math.max(0, Math.trunc(estimated?.inputTokens || 0)),
    outputTokens: Math.max(0, Math.trunc(estimated?.outputTokens || 0)),
    totalTokens: Math.max(0, Math.trunc(estimated?.inputTokens || 0)) + Math.max(0, Math.trunc(estimated?.outputTokens || 0)),
    cachedInputTokens: 0,
    reasoningTokens: 0,
    source: TokenUsageSource.TOKENIZER,
  }
}
