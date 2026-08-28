import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeChatUsage, normalizeChatUsage } from '../../server/src/generations/chat-usage.ts'

test('OpenAI 用量包含缓存输入和推理 Token', () => {
  assert.deepEqual(normalizeChatUsage('openai', {
    prompt_tokens: 120,
    completion_tokens: 80,
    prompt_tokens_details: { cached_tokens: 40 },
    completion_tokens_details: { reasoning_tokens: 30 },
  }), {
    prompt_tokens: 120,
    completion_tokens: 80,
    cached_input_tokens: 40,
    reasoning_tokens: 30,
  })
})

test('Anthropic 输入用量合并普通、缓存读取和缓存写入', () => {
  assert.deepEqual(normalizeChatUsage('anthropic', {
    input_tokens: 20,
    cache_read_input_tokens: 50,
    cache_creation_input_tokens: 10,
    output_tokens: 25,
  }), {
    prompt_tokens: 80,
    completion_tokens: 25,
    cached_input_tokens: 50,
  })
})

test('Gemini 将思考 Token 纳入输出总量并保留细分', () => {
  assert.deepEqual(normalizeChatUsage('gemini', {
    promptTokenCount: 70,
    candidatesTokenCount: 40,
    thoughtsTokenCount: 15,
    cachedContentTokenCount: 12,
  }), {
    prompt_tokens: 70,
    completion_tokens: 55,
    cached_input_tokens: 12,
    reasoning_tokens: 15,
  })
})

test('流式分段用量不会互相覆盖', () => {
  const input = normalizeChatUsage('anthropic', { input_tokens: 20, cache_read_input_tokens: 5 })
  const output = normalizeChatUsage('anthropic', { output_tokens: 30 })
  assert.deepEqual(mergeChatUsage(input, output), {
    prompt_tokens: 25,
    completion_tokens: 30,
    cached_input_tokens: 5,
    reasoning_tokens: 0,
  })
})
