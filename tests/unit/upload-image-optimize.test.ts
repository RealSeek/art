import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from '../../server/node_modules/sharp/dist/index.cjs'
import { AssetsService } from '../../server/src/assets/assets.service'

const service = () => new AssetsService({} as never, {} as never, {} as never)
const prepare = (data: Uint8Array, mimeType: string) => (service() as never as { prepareUploadImage: (value: Uint8Array, type: string) => Promise<Uint8Array> }).prepareUploadImage(data, mimeType)

test('小图原样存储，不触发同步重编码', async () => {
  const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3366ff' } }).png().toBuffer()
  assert.equal(await prepare(small, 'image/png'), small)
})

test('超过长边上限的图片会降采样后存储', async () => {
  const large = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3366ff' } }).png().toBuffer()
  const prepared = await prepare(large, 'image/png')
  const metadata = await sharp(prepared).metadata()
  assert.equal(metadata.width, 2560)
  assert.equal(metadata.height, 1707)
})

test('无效图片内容仍会被拒绝，非图片类型直接放行', async () => {
  await assert.rejects(() => prepare(Buffer.from('not an image'), 'image/png'), /图片内容无效/)
  const audio = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00')
  assert.equal(await prepare(audio, 'audio/mpeg'), audio)
})
