export type ChatUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  cached_input_tokens?: number
  reasoning_tokens?: number
}

type UsageProtocol = 'openai' | 'anthropic' | 'gemini'

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function token(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0
}

function has(row: Record<string, unknown>, ...keys: string[]) {
  return keys.some((key) => row[key] !== undefined && row[key] !== null)
}

export function normalizeChatUsage(protocol: UsageProtocol, value: unknown): ChatUsage | undefined {
  const usage = record(value)
  if (!usage) return undefined

  let result: ChatUsage
  if (protocol === 'anthropic') {
    const hasInput = has(usage, 'input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')
    result = {
      prompt_tokens: hasInput
        ? token(usage.input_tokens) + token(usage.cache_read_input_tokens) + token(usage.cache_creation_input_tokens)
        : undefined,
      completion_tokens: has(usage, 'output_tokens') ? token(usage.output_tokens) : undefined,
      cached_input_tokens: has(usage, 'cache_read_input_tokens') ? token(usage.cache_read_input_tokens) : undefined,
    }
  } else if (protocol === 'gemini') {
    const reasoningTokens = token(usage.thoughtsTokenCount)
    result = {
      prompt_tokens: has(usage, 'promptTokenCount') ? token(usage.promptTokenCount) : undefined,
      completion_tokens: has(usage, 'candidatesTokenCount', 'thoughtsTokenCount')
        ? token(usage.candidatesTokenCount) + reasoningTokens
        : undefined,
      cached_input_tokens: has(usage, 'cachedContentTokenCount') ? token(usage.cachedContentTokenCount) : undefined,
      reasoning_tokens: has(usage, 'thoughtsTokenCount') ? reasoningTokens : undefined,
    }
  } else {
    const inputDetails = record(usage.input_tokens_details) || record(usage.prompt_tokens_details)
    const outputDetails = record(usage.output_tokens_details) || record(usage.completion_tokens_details)
    result = {
      prompt_tokens: has(usage, 'input_tokens', 'prompt_tokens')
        ? token(usage.input_tokens ?? usage.prompt_tokens)
        : undefined,
      completion_tokens: has(usage, 'output_tokens', 'completion_tokens')
        ? token(usage.output_tokens ?? usage.completion_tokens)
        : undefined,
      cached_input_tokens: inputDetails && has(inputDetails, 'cached_tokens')
        ? token(inputDetails.cached_tokens)
        : undefined,
      reasoning_tokens: outputDetails && has(outputDetails, 'reasoning_tokens')
        ? token(outputDetails.reasoning_tokens)
        : undefined,
    }
  }

  const compact = Object.fromEntries(Object.entries(result).filter(([, item]) => item !== undefined)) as ChatUsage
  return Object.keys(compact).length ? compact : undefined
}

export function mergeChatUsage(...items: Array<ChatUsage | undefined>): ChatUsage | undefined {
  const result = items.reduce<Required<ChatUsage>>((total, item) => ({
    prompt_tokens: total.prompt_tokens + token(item?.prompt_tokens),
    completion_tokens: total.completion_tokens + token(item?.completion_tokens),
    cached_input_tokens: total.cached_input_tokens + token(item?.cached_input_tokens),
    reasoning_tokens: total.reasoning_tokens + token(item?.reasoning_tokens),
  }), { prompt_tokens: 0, completion_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0 })
  return Object.values(result).some(Boolean) ? result : undefined
}
