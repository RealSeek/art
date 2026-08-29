import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultAssistantPresets, defaultToolPresets } from '../../server/src/workspace/default-capability-presets'
import { defaultWebSearchPresets } from '../../server/src/agent-tasks/default-web-search-presets'

test('默认助手 ID 唯一且具备完整的用途和系统指令', () => {
  assert.equal(new Set(defaultAssistantPresets.map((item) => item.id)).size, defaultAssistantPresets.length)
  for (const assistant of defaultAssistantPresets) {
    assert.ok(assistant.name.trim())
    assert.ok(assistant.description.length >= 20)
    assert.ok(assistant.systemPrompt.length >= 80)
    assert.ok(assistant.templateIds.length > 0)
    assert.ok(assistant.toolIds.length > 0)
    assert.ok(assistant.toolIds.every((id) => defaultToolPresets.some((tool) => tool.id === id)))
  }
})

test('联网搜索预设不携带密钥且默认关闭', () => {
  assert.equal(new Set(defaultWebSearchPresets.map((item) => item.id)).size, defaultWebSearchPresets.length)
  assert.deepEqual(defaultWebSearchPresets.map((item) => item.type).sort(), ['BRAVE', 'EXA', 'SEARXNG', 'SERPER', 'TAVILY'])
  for (const channel of defaultWebSearchPresets) {
    assert.equal(channel.enabled, false)
    assert.match(channel.documentationUrl, /^https:\/\//)
  }
})

test('第三方工具预设默认关闭且不内置部署地址或密钥', () => {
  assert.equal(new Set(defaultToolPresets.map((item) => item.key)).size, defaultToolPresets.length)
  const external = defaultToolPresets.filter((item) => item.documentationUrl)
  assert.deepEqual(external.map((item) => item.key).sort(), ['dify_workflow', 'fastgpt_workflow', 'n8n_workflow'])
  for (const tool of external) {
    assert.equal(tool.enabled, false)
    assert.equal(tool.endpoint, '')
    assert.match(tool.documentationUrl, /^https:\/\//)
    assert.equal(tool.requiresApproval, true)
  }
})
