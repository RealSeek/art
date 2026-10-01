import assert from 'node:assert/strict'
import test from 'node:test'
import { studioFileRedirect, studioFileRequest } from '../../src/composables/studio/useStudioFileUpload.ts'

test('工作区文件入口保持原有登录回跳地址', () => {
  assert.equal(studioFileRedirect('chat'), '/chat')
  assert.equal(studioFileRedirect('images'), '/image')
  assert.equal(studioFileRedirect('videos'), '/video')
  assert.equal(studioFileRedirect('commerce'), '/commerce')
  assert.equal(studioFileRedirect('assets'), '/workspace?tab=files')
})

test('上传用途只区分对话附件、创作参考图和文件库', () => {
  assert.deepEqual(studioFileRequest('chat-file'), { kind: undefined, purpose: 'attachment' })
  assert.deepEqual(studioFileRequest('creation'), { kind: 'IMAGE', purpose: 'reference' })
  assert.deepEqual(studioFileRequest('library'), { kind: undefined, purpose: 'library' })
})
