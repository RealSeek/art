import assert from 'node:assert/strict'
import test from 'node:test'
import { inferModelCapability, ModelDiscoveryService } from '../../server/src/providers/model-discovery.service'

const endpointPolicy = { assertPublicHttpUrl: async (value: string) => new URL(value) }

test('MiniMaxH3 各分辨率及渠道前缀识别为视频，MiniMax 聊天模型保持聊天分类', async () => {
  const originalFetch = globalThis.fetch
  const videoIds = ['', '[c]'].flatMap(prefix => ['480p', '720p', '2k', '2k-pro'].map(size => `${prefix}MiniMaxH3-${size}`))
  try {
    globalThis.fetch = async () => new Response('{}', { status: 200 })
    const models = await new ModelDiscoveryService(endpointPolicy as never).discover(
      [...videoIds, 'MiniMax-M2', 'MiniMax-M1', 'MiniMax-Text-01', 'MiniMax-Hailuo-02'],
      { creditValueMicros: 10_000, markupPercent: 130 },
    )
    for (const model of models) {
      assert.equal(model.vendorKey, 'minimax', model.id)
      assert.equal(model.vendorName, 'MiniMax', model.id)
      assert.equal(model.capability, videoIds.includes(model.id) || model.id.includes('Hailuo') ? 'VIDEO' : 'CHAT', model.id)
      assert.equal(model.importable, true, model.id)
    }
    assert.equal(models.length, 12)
    for (const id of videoIds) assert.equal(inferModelCapability(id), 'VIDEO', id)
    assert.equal(inferModelCapability('[C]MINIMAXH3-720P'), 'VIDEO')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('模型价格目录刷新失败时保留上一次成功结果', async () => {
  const originalFetch = globalThis.fetch
  const service = new ModelDiscoveryService(endpointPolicy as never)
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      'example-chat': {
        mode: 'chat',
        litellm_provider: 'openai',
        input_cost_per_token: 0.000002,
        output_cost_per_token: 0.000008,
      },
    }), { status: 200 })
    const first = await service.discover(['example-chat'], { creditValueMicros: 10_000, markupPercent: 130, forceRefresh: true })
    assert.equal(first[0]?.pricingSource, 'litellm')
    assert.equal(first[0]?.inputCreditsPerMillion, 260)

    globalThis.fetch = async () => { throw new Error('catalog unavailable') }
    const retained = await service.discover(['example-chat'], { creditValueMicros: 10_000, markupPercent: 130, forceRefresh: true })
    assert.equal(retained[0]?.pricingSource, 'litellm')
    assert.equal(retained[0]?.inputCreditsPerMillion, 260)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('模型售价会按 USD 汇率换算为结算币种额度', async () => {
  const originalFetch = globalThis.fetch
  const service = new ModelDiscoveryService(endpointPolicy as never)
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      'exchange-chat': {
        mode: 'chat',
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002,
      },
    }), { status: 200 })
    const result = await service.discover(['exchange-chat'], {
      creditValueMicros: 10_000,
      pricingUsdExchangeRateMicros: 7_200_000,
      markupPercent: 130,
      forceRefresh: true,
    })
    assert.equal(result[0]?.inputCreditsPerMillion, 936)
    assert.equal(result[0]?.outputCreditsPerMillion, 1872)
  } finally {
    globalThis.fetch = originalFetch
  }
})
