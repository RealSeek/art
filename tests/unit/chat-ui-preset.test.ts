import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveChatUiPreset } from '../../src/layouts/chat-presets'

test('空白聊天首页使用后台配置的界面预设', () => {
  for (const preset of ['gpt', 'doubao', 'qianwen', 'kimi'] as const) {
    assert.equal(resolveChatUiPreset(preset, false), preset)
  }
})

test('进入任何对话后固定使用豆包界面', () => {
  for (const preset of ['gpt', 'doubao', 'qianwen', 'kimi'] as const) {
    assert.equal(resolveChatUiPreset(preset, true), 'doubao')
  }
})
