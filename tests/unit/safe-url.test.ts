import assert from 'node:assert/strict'
import test from 'node:test'
import { safeHttpNavigationUrl } from '../../src/utils/safe-url.ts'

test('safeHttpNavigationUrl 只接受不含凭据的 HTTP 地址', () => {
  assert.equal(safeHttpNavigationUrl('/checkout?id=1', 'https://app.example'), 'https://app.example/checkout?id=1')
  assert.equal(safeHttpNavigationUrl('https://pay.example/session', 'https://app.example'), 'https://pay.example/session')
  assert.equal(safeHttpNavigationUrl('javascript:alert(1)', 'https://app.example'), '')
  assert.equal(safeHttpNavigationUrl('data:text/html,unsafe', 'https://app.example'), '')
  assert.equal(safeHttpNavigationUrl('https://user:pass@pay.example', 'https://app.example'), '')
})
