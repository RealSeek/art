import assert from 'node:assert/strict'
import test from 'node:test'
import { PublicEndpointPolicyService } from '../../server/src/common/public-endpoint-policy.service'
import { WebSearchService } from '../../server/src/agent-tasks/web-search.service'

const CUSTOM = 'CUSTOM' as never

const cryptoStub = {
  encrypt: (value: string) => value,
  hint: (value: string) => value.slice(0, 4),
  decrypt: (value: string) => value,
}

test('web search channel creation rejects private endpoints before persistence', async () => {
  let created = false
  const prisma = {
    webSearchChannel: {
      create: async () => { created = true; throw new Error('should not persist') },
    },
  }
  const service = new WebSearchService(
    prisma as never,
    cryptoStub as never,
    new PublicEndpointPolicyService(),
  )

  await assert.rejects(
    () => service.create({
      name: 'Private search',
      type: CUSTOM,
      endpoint: 'http://127.0.0.1:8080/search',
      enabled: true,
    }),
    /公网 HTTP\/HTTPS/,
  )
  assert.equal(created, false)
})

test('web search execution revalidates legacy or imported endpoints before fetch', async (t) => {
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  t.after(() => { globalThis.fetch = originalFetch })

  const service = new WebSearchService(
    {} as never,
    cryptoStub as never,
    new PublicEndpointPolicyService(),
  )
  const execute = (service as unknown as {
    execute(channel: unknown, input: unknown): Promise<unknown>
  }).execute.bind(service)

  await assert.rejects(
    () => execute({
      id: 'legacy-private',
      type: CUSTOM,
      endpoint: 'http://169.254.169.254/latest/meta-data',
      encryptedApiKey: '',
      config: {},
      maxResults: 3,
      timeoutMs: 1000,
    }, { query: 'metadata' }),
    /公网 HTTP\/HTTPS/,
  )
  assert.equal(fetchCalled, false)
})

test('web search execution rejects redirects instead of following an untrusted endpoint', async (t) => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ redirect?: RequestRedirect }> = []
  globalThis.fetch = (async (_input, init) => {
    calls.push({ redirect: init?.redirect })
    return new Response('', { status: 302, headers: { location: 'http://127.0.0.1:8080/private' } })
  }) as typeof fetch
  t.after(() => { globalThis.fetch = originalFetch })

  const service = new WebSearchService(
    {} as never,
    cryptoStub as never,
    { assertPublicHttpUrl: async (value: string) => new URL(value) } as never,
  )
  const execute = (service as unknown as {
    execute(channel: unknown, input: unknown): Promise<unknown>
  }).execute.bind(service)

  await assert.rejects(
    () => execute({
      id: 'redirecting-search',
      type: CUSTOM,
      endpoint: 'https://search.example.test/api',
      encryptedApiKey: '',
      config: {},
      maxResults: 3,
      timeoutMs: 1000,
    }, { query: 'test' }),
    /HTTP 302/,
  )
  assert.deepEqual(calls, [{ redirect: 'error' }])
})

test('the built-in Docker DailyHot endpoint remains an explicit narrow exception', async () => {
  const service = new WebSearchService(
    {} as never,
    cryptoStub as never,
    new PublicEndpointPolicyService(),
  )
  const assertEndpoint = (service as unknown as {
    assertSearchEndpoint(value: string, integration?: string): Promise<URL>
  }).assertSearchEndpoint.bind(service)

  const allowed = await assertEndpoint('http://dailyhot:6688', 'dailyhot')
  assert.equal(allowed.hostname, 'dailyhot')
  await assert.rejects(
    () => assertEndpoint('http://127.0.0.1:6688', 'dailyhot'),
    /公网 HTTP\/HTTPS/,
  )
})
