import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetsService } from '../../server/src/assets/assets.service'

test('public chat home images are selected only from purpose-scoped image assets', async () => {
  let where: Record<string, unknown> | undefined
  const service = new AssetsService(
    {} as never,
    {
      asset: {
        findFirst: async (input: { where: Record<string, unknown> }) => {
          where = input.where
          return null
        },
      },
    } as never,
    {} as never,
  )

  await assert.rejects(() => service.readPublicChatHomeImage('asset-private'), /首页图片不存在/)
  assert.deepEqual(where, {
    id: 'asset-private',
    deletedAt: null,
    kind: 'IMAGE',
    metadata: { path: ['purpose'], equals: 'chat-home-banner' },
  })
})
