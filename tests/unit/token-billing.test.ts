import test from 'node:test'
import assert from 'node:assert/strict'
import { PricingResolverService } from '../../server/src/billing/pricing-resolver.service'
import { TokenizerService } from '../../server/src/billing/tokenizer.service'
import { normalizeUsage } from '../../server/src/billing/usage-normalizer'

test('pricing resolver keeps cached and reasoning details from double charging', () => {
  const resolver = new PricingResolverService()
  const snapshot = resolver.snapshot({ model: 'gpt-4o', inputRate: 100, outputRate: 300, inputCostMicrosPerMillion: 10, outputCostMicrosPerMillion: 20 })
  assert.equal(resolver.chargedUnits(snapshot, { inputTokens: 10_000, outputTokens: 2_000, cachedInputTokens: 5_000, reasoningTokens: 1_000 }), 2n)
  assert.equal(resolver.costMicros(snapshot, { inputTokens: 10_000, outputTokens: 2_000 }), 1)
  assert.equal(snapshot.resolverVersion, 'v1')
})

test('tokenizer handles Chinese, code, JSON and message overhead', () => {
  const tokenizer = new TokenizerService()
  assert.ok(tokenizer.estimateText('你好，世界') > 0)
  assert.ok(tokenizer.estimateText('{"key":"value","items":[1,2,3]}') > 0)
  assert.ok(tokenizer.estimateText('```ts\nconst value = 1\n```') > 0)
  assert.ok(tokenizer.estimateMessages([{ role: 'system', content: '规则' }, { role: 'user', content: '问题' }]) > 2)
})

test('usage normalizer marks provider usage and tokenizer fallback', () => {
  const provider = normalizeUsage('openai', { input_tokens: 12, output_tokens: 8, input_tokens_details: { cached_tokens: 3 } })
  assert.deepEqual(provider, { inputTokens: 12, outputTokens: 8, cachedInputTokens: 3, reasoningTokens: 0, source: 'PROVIDER' })
  const fallback = normalizeUsage('openai', undefined, { inputTokens: 20, outputTokens: 4 })
  assert.deepEqual(fallback, { inputTokens: 20, outputTokens: 4, cachedInputTokens: 0, reasoningTokens: 0, source: 'TOKENIZER' })
})
