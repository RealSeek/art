import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('payment popup drops its opener before navigating to a checkout URL', () => {
  const source = readFileSync('src/components/WorkspaceShell.vue', 'utf8')
  const openIndex = source.indexOf("window.open('', '_blank')")
  const detachIndex = source.indexOf('paymentWindow.opener = null', openIndex)
  const navigateIndex = source.indexOf('paymentWindow.location.replace', openIndex)

  assert.ok(openIndex >= 0, 'payment popup creation is missing')
  assert.ok(detachIndex > openIndex, 'payment popup must detach its opener')
  assert.ok(navigateIndex > detachIndex, 'opener must be detached before checkout navigation')
})
