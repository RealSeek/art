import assert from 'node:assert/strict'
import test from 'node:test'
import { readResponseBytes } from '../../server/src/common/response-bytes'

test('response byte reader accepts content within the configured limit', async () => {
  const bytes = await readResponseBytes(new Response('hello'), 5, '文件')
  assert.equal(Buffer.from(bytes).toString('utf8'), 'hello')
})

test('response byte reader stops streaming content above the configured limit', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.enqueue(new Uint8Array([4, 5, 6]))
      controller.close()
    },
  }))
  await assert.rejects(() => readResponseBytes(response, 5, '文件'), /超过大小限制/)
})
