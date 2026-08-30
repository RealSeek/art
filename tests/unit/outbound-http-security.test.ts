import assert from 'node:assert/strict'
import test from 'node:test'
import { createPublicNetworkLookup, fetchNoRedirect, fetchPublicNoRedirect, OutboundRedirectError, runWithOutboundSignal } from '../../server/src/common/outbound-http'

test('outbound HTTP rejects redirects to loopback, private, and metadata targets', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  for (const [status, location] of [
    [302, 'http://127.0.0.1:3100/v1/admin'],
    [307, 'http://10.0.0.8/internal'],
    [302, 'http://169.254.169.254/latest/meta-data'],
  ] as const) {
    let calls = 0
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1
      assert.equal(init?.redirect, 'error')
      return new Response(null, { status, headers: { location } })
    }) as typeof fetch

    await assert.rejects(
      () => fetchNoRedirect('https://provider.example/v1/chat/completions'),
      (error: unknown) => error instanceof OutboundRedirectError,
      `${status} -> ${location}`,
    )
    assert.equal(calls, 1, `redirect must not issue a second request to ${location}`)
  }
})

test('outbound HTTP inherits a lost-worker abort signal', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const controller = new AbortController()
  controller.abort(new Error('lease lost'))
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.signal?.aborted, true)
    throw init?.signal?.reason
  }) as typeof fetch

  await assert.rejects(
    () => runWithOutboundSignal(controller.signal, () => fetchNoRedirect('https://provider.example/v1/models')),
    /lease lost/,
  )
})

test('public outbound fetch rejects private IP literals before network I/O', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let calls = 0
  globalThis.fetch = (async () => { calls += 1; return new Response('ok') }) as typeof fetch

  await assert.rejects(() => fetchPublicNoRedirect('http://169.254.169.254/latest/meta-data'), /非公网地址/)
  assert.equal(calls, 0)
})

test('public outbound fetch installs the DNS-validating dispatcher on the actual request', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    assert.ok((init as RequestInit & { dispatcher?: unknown })?.dispatcher)
    assert.equal(init?.redirect, 'error')
    return new Response('ok')
  }) as typeof fetch

  const response = await fetchPublicNoRedirect('https://provider.example/v1/models')
  assert.equal(await response.text(), 'ok')
})

test('socket lookup rejects a DNS answer set containing any private address', async () => {
  const lookup = createPublicNetworkLookup((_hostname, _options, callback) => callback(null, [
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]))

  await new Promise<void>((resolve, reject) => {
    lookup('provider.example', { all: false }, (error) => {
      try {
        assert.equal((error as NodeJS.ErrnoException | null)?.code, 'EACCES')
        resolve()
      } catch (reason) { reject(reason) }
    })
  })
})

test('socket lookup returns the already validated public address to the connector', async () => {
  const lookup = createPublicNetworkLookup((_hostname, _options, callback) => callback(null, [
    { address: '93.184.216.34', family: 4 },
  ]))

  await new Promise<void>((resolve, reject) => {
    lookup('provider.example', { all: false }, (error, address, family) => {
      try {
        assert.equal(error, null)
        assert.equal(address, '93.184.216.34')
        assert.equal(family, 4)
        resolve()
      } catch (reason) { reject(reason) }
    })
  })
})
