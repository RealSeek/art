import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateNetworkAddress, PublicEndpointPolicyService } from '../../server/src/common/public-endpoint-policy.service'

test('public endpoint policy rejects localhost and private IPs', async () => {
  const policy = new PublicEndpointPolicyService()
  await assert.rejects(() => policy.assertPublicHttpUrl('http://localhost:8080/tool'))
  await assert.rejects(() => policy.assertPublicHttpUrl('http://127.0.0.1:8080/tool'))
  await assert.rejects(() => policy.assertPublicHttpUrl('http://169.254.169.254/latest/meta-data'))
})

test('public endpoint policy only allows HTTP and HTTPS', async () => {
  const policy = new PublicEndpointPolicyService()
  await assert.rejects(() => policy.assertPublicHttpUrl('file:///etc/passwd'))
  await assert.rejects(() => policy.assertPublicHttpUrl('ftp://example.com/tool'))
})

test('public endpoint policy rejects private targets hidden in IPv6 transition formats', () => {
  for (const address of [
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::127.0.0.1',
    '2002:7f00:0001::',
    '2001:0000:4136:e378:8000:63bf:3fff:fdd2',
    '64:ff9b::7f00:1',
  ]) {
    assert.equal(isPrivateNetworkAddress(address), true, address)
  }
})

test('public endpoint policy keeps globally routable IPv4 and IPv6 addresses available', () => {
  assert.equal(isPrivateNetworkAddress('8.8.8.8'), false)
  assert.equal(isPrivateNetworkAddress('2606:4700:4700::1111'), false)
})

test('public endpoint policy does not over-block adjacent public IPv4 ranges', () => {
  for (const address of ['192.2.1.1', '198.51.1.1', '203.0.1.1']) {
    assert.equal(isPrivateNetworkAddress(address), false, address)
  }
  for (const address of ['192.0.2.1', '198.51.100.1', '203.0.113.1']) {
    assert.equal(isPrivateNetworkAddress(address), true, address)
  }
})

test('public endpoint policy parses bracketed IPv6 literals before applying the IP policy', async () => {
  const policy = new PublicEndpointPolicyService()
  const url = await policy.assertPublicHttpUrl('https://[2606:4700:4700::1111]/health')
  assert.equal(url.hostname, '[2606:4700:4700::1111]')
  await assert.rejects(() => policy.assertPublicHttpUrl('https://[::1]/health'))
})
