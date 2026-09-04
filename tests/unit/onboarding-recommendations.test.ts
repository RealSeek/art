import assert from 'node:assert/strict'
import test from 'node:test'
import { recommendGroupNames } from '../../src/components/onboarding/recommendations'

test('新手引导为每类能力预选最低倍率分组，并避免重复选择同一分组', () => {
  const groups = [
    { name: '综合', ratio: 0.2, models: ['chat', 'imagen', 'veo'], capabilities: ['CHAT', 'IMAGE', 'VIDEO'] },
    { name: '聊天', ratio: 0.1, models: ['chat'], capabilities: ['CHAT'] },
    { name: '图片', ratio: 0.15, models: ['imagen'], capabilities: ['IMAGE'] },
  ] as const

  const result = recommendGroupNames(groups.map((group) => ({ ...group, models: [...group.models], capabilities: [...group.capabilities] })), ['CHAT', 'IMAGE', 'VIDEO'])

  assert.deepEqual([...result], ['聊天', '图片', '综合'])
})

test('新手引导不会预选已经接入的分组', () => {
  const groups = [{ name: 'gemini', ratio: 0.2, models: ['gemini-2.5-pro'], capabilities: ['CHAT' as const] }]
  assert.deepEqual([...recommendGroupNames(groups, ['CHAT'], new Set(['gemini']))], [])
})
