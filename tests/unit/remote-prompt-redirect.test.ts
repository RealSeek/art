import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getGlobalDispatcher,
  MockAgent,
  setGlobalDispatcher,
} from '../../server/node_modules/undici/index.js'
import { requestText } from '../../server/src/prompt-templates/remote-video-library'

const PROXY_ENV_NAMES = [
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'https_proxy',
  'http_proxy',
] as const

test('remote prompt crawler follows only revalidated HTTPS redirects', async (t) => {
  const previousDispatcher = getGlobalDispatcher()
  const previousProxyEnv = new Map(
    PROXY_ENV_NAMES.map((name) => [name, process.env[name]]),
  )
  for (const name of PROXY_ENV_NAMES) delete process.env[name]

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  t.after(async () => {
    setGlobalDispatcher(previousDispatcher)
    await mockAgent.close()
    for (const [name, value] of previousProxyEnv) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  const youMind = mockAgent.get('https://youmind.com')
  youMind
    .intercept({ path: '/start', method: 'GET' })
    .reply(302, '', { headers: { location: '/next' } })
  youMind.intercept({ path: '/next', method: 'GET' }).reply(200, 'ok')
  assert.equal(await requestText('https://youmind.com/start'), 'ok')

  for (let attempt = 0; attempt < 2; attempt += 1) {
    youMind
      .intercept({ path: '/unsafe', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://evil.example/private' } })
  }
  await assert.rejects(
    () => requestText('https://youmind.com/unsafe'),
    /来源不在允许列表/,
  )
})

test('remote prompt crawler rejects redirect chains beyond three hops', async (t) => {
  const previousDispatcher = getGlobalDispatcher()
  const previousProxyEnv = new Map(
    PROXY_ENV_NAMES.map((name) => [name, process.env[name]]),
  )
  for (const name of PROXY_ENV_NAMES) delete process.env[name]

  const mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
  t.after(async () => {
    setGlobalDispatcher(previousDispatcher)
    await mockAgent.close()
    for (const [name, value] of previousProxyEnv) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  const source = mockAgent.get('https://generateprompt.net')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (let hop = 0; hop < 4; hop += 1) {
      source
        .intercept({ path: `/hop-${hop}`, method: 'GET' })
        .reply(302, '', { headers: { location: `/hop-${hop + 1}` } })
    }
  }
  await assert.rejects(
    () => requestText('https://generateprompt.net/hop-0'),
    /重定向次数超过限制/,
  )
})
