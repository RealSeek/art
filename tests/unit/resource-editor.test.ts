import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResourceEditorPayload, resourceEditorValue } from '../../admin/src/views/xinyue/operations/resource-editor.ts'

test('图片工具编辑值从 options 单一读取', () => {
  const row = { options: { toolKey: 'outpaint', toolType: 'OUTPAINT', steps: 42 } }
  assert.equal(resourceEditorValue('imageTools', 'toolKey', row, {}, true), 'outpaint')
  assert.equal(resourceEditorValue('imageTools', 'steps', row, { steps: 30 }, true), 42)
})

test('图片工具 payload 将编辑字段归入 options', () => {
  const fields = [
    { key: 'title', label: '标题' },
    { key: 'toolKey', label: '工具' },
    { key: 'steps', label: '步数' }
  ]
  const payload = buildResourceEditorPayload('imageTools', fields, { title: '扩图', toolKey: 'outpaint', steps: 36 }, null)
  assert.equal(payload.mode, 'IMAGE_TOOL')
  assert.equal(payload.title, '扩图')
  assert.equal(payload.toolKey, undefined)
  assert.equal(payload.options.toolKey, 'outpaint')
  assert.equal(payload.options.steps, 36)
})

test('工具密钥为空时不会覆盖已有服务端密钥', () => {
  const fields = [{ key: 'headersText', label: '请求头' }, { key: 'secretHeadersText', label: '密钥' }]
  const payload = buildResourceEditorPayload('tools', fields, { headersText: '{"X-Test":"1"}', secretHeadersText: '' }, null)
  assert.deepEqual(payload.headers, { 'X-Test': '1' })
  assert.equal(payload.secretHeaders, undefined)
})
