import test from 'node:test'
import assert from 'node:assert/strict'
import { PublicEndpointPolicyService } from '../../server/src/common/public-endpoint-policy.service'

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
