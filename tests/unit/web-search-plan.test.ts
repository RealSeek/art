import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWebSearchPlan } from '../../server/src/generations/runners/chat-generation.runner'

test('模型可决定不联网', () => {
  assert.deepEqual(parseWebSearchPlan('{"needsSearch":false,"queries":[]}'), {
    needsSearch: false,
    queries: [],
  })
})

test('模型决定联网时清理并限制搜索词', () => {
  assert.deepEqual(parseWebSearchPlan('```json\n{"needsSearch":true,"queries":["  最新   新闻 ","版本说明","价格","忽略"]}\n```'), {
    needsSearch: true,
    queries: ['最新 新闻', '版本说明', '价格'],
  })
})

test('没有有效搜索词时不执行联网', () => {
  assert.deepEqual(parseWebSearchPlan('{"needsSearch":true,"queries":["  "]}'), {
    needsSearch: false,
    queries: [],
  })
})
