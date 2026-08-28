import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chatJsonResult,
  chatStreamChunk,
  consumeTaggedReasoning
} from '../../server/src/generations/chat-response-parser.ts'

test('跨流式分片的 think 标签与正文分离', () => {
  const first = consumeTaggedReasoning('<thi', false, '')
  const second = consumeTaggedReasoning('nk>分析中</think>正文', first.open, first.carry)
  assert.deepEqual(first, { content: '', reasoning: '', open: false, carry: '<thi' })
  assert.equal(second.reasoning, '分析中')
  assert.equal(second.content, '正文')
  assert.equal(second.open, false)
})

test('OpenAI JSON 同时提取正文、推理与用量', () => {
  const result = chatJsonResult('openai', {
    choices: [{ message: { content: '最终回答', reasoning_content: '内部推理' } }],
    usage: { prompt_tokens: 12, completion_tokens: 8 }
  })
  assert.equal(result.content, '最终回答')
  assert.equal(result.reasoning, '内部推理')
  assert.deepEqual(result.usage, { prompt_tokens: 12, completion_tokens: 8 })
})

test('Anthropic 与 Gemini 流式思考增量不会混入正文', () => {
  assert.deepEqual(chatStreamChunk('anthropic', {
    delta: { type: 'thinking_delta', thinking: '分析' }
  }), { delta: '', reasoningDelta: '分析', usage: undefined })
  const gemini = chatStreamChunk('gemini', {
    candidates: [{ content: { parts: [{ thought: true, text: '推理' }, { text: '正文' }] } }]
  })
  assert.equal(gemini.delta, '正文')
  assert.equal(gemini.reasoningDelta, '推理')
})
