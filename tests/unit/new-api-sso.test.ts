import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthController } from '../../server/src/auth/auth.controller'
import { AuthService } from '../../server/src/auth/auth.service'

const values: Record<string, string> = {
  NEW_API_BASE_URL: 'http://new-api:3000',
  NEW_API_PUBLIC_URL: 'https://new-api.example.com',
  NEW_API_SSO_CLIENT_ID: 'onlyart',
  NEW_API_SSO_CLIENT_SECRET: '12345678901234567890123456789012',
}

function service() {
  const config = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (!values[key]) throw new Error(`缺少 ${key}`)
      return values[key]
    },
  }
  return new AuthService({} as never, config as never, {} as never, {} as never, {} as never, {} as never)
}

test('New API SSO 授权地址只使用公开地址并绑定客户端、回调和 state', () => {
  const auth = service()
  const result = new URL(auth.getNewApiAuthorization('state-value', 'https://art.example.com/v1/auth/new-api/callback'))

  assert.equal(result.origin, 'https://new-api.example.com')
  assert.equal(result.pathname, '/api/user/auth/sso/art/authorize')
  assert.equal(result.searchParams.get('client_id'), 'onlyart')
  assert.equal(result.searchParams.get('redirect_uri'), 'https://art.example.com/v1/auth/new-api/callback')
  assert.equal(result.searchParams.get('state'), 'state-value')
})

test('New API SSO 登录起点显式返回 302', async () => {
  const auth = { getNewApiAuthorization: () => 'https://new-api.example.com/authorize' }
  const config = { get: (key: string) => key === 'WEB_ORIGIN' ? 'https://art.example.com' : undefined }
  let redirect: [string, number] | undefined
  const reply = {
    setCookie: () => reply,
    redirect: (url: string, statusCode: number) => {
      redirect = [url, statusCode]
      return reply
    },
  }
  const controller = new AuthController(auth as never, config as never)

  await controller.newApiStart('/chat', reply as never)

  assert.deepEqual(redirect, ['https://new-api.example.com/authorize', 302])
})

test('New API SSO 换票仅在服务端发送密钥并创建外部身份会话', async (t) => {
  const auth = service()
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let requestUrl = ''
  let requestBody: Record<string, string> = {}
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body)) as Record<string, string>
    return new Response(JSON.stringify({ success: true, data: { subject: '42', username: 'alice', email: 'alice@example.com', display_name: 'Alice', role: 1 } }), { status: 200 })
  }) as typeof fetch
  let external: { provider?: string; subject?: string; input?: Record<string, unknown> } = {}
  auth.loginExternal = (async (provider, subject, input) => {
    external = { provider, subject, input }
    return { user: { id: 'local-user', email: 'alice@example.com', username: 'alice', displayName: 'Alice', role: 'USER' }, token: 'onlyart-session', expiresAt: new Date() }
  }) as typeof auth.loginExternal

  await auth.loginWithNewApi('one-time-code', 'https://art.example.com/v1/auth/new-api/callback', { ip: '127.0.0.1' })

  assert.equal(requestUrl, 'http://new-api:3000/api/sso/art/token')
  assert.equal(requestBody.client_secret, values.NEW_API_SSO_CLIENT_SECRET)
  assert.equal(requestBody.code, 'one-time-code')
  assert.equal(external.provider, 'new-api')
  assert.equal(external.subject, '42')
  assert.equal(external.input?.allowRegistrationWhenClosed, true)
  assert.equal(external.input?.username, 'alice')
})

test('首次 New API 外部身份创建时开启引导，其他注册来源保持默认值', async () => {
  const created: Array<Record<string, unknown>> = []
  const prisma = {
    externalIdentity: { findUnique: async () => null },
    systemSetting: {
      upsert: async () => ({ registrationEnabled: true, defaultUserGroupId: 'group-1', defaultTheme: 'dark', defaultLanguage: 'zh-CN', defaultChatHistoryEnabled: true, defaultTrainingOptOut: true, defaultShareUsageAnalytics: false, defaultUserCredits: 0 }),
      update: async () => undefined,
    },
    userGroup: { findFirst: async () => ({ id: 'group-1' }), upsert: async () => ({ id: 'group-1' }) },
    user: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: `user-${created.length}`, email: null, username: null, displayName: '测试用户', role: 'USER' }
      },
    },
    session: { create: async () => undefined },
  }
  const config = { get: (_key: string, fallback?: unknown) => fallback, getOrThrow: () => 'session-secret' }
  const referrals = { attributeRegistration: async () => undefined }
  const auth = new AuthService(prisma as never, config as never, {} as never, {} as never, referrals as never, {} as never)

  await auth.loginExternal('new-api', '42', { displayName: '测试用户', meta: {} })
  await auth.loginExternal('community', '43', { displayName: '测试用户', meta: {} })

  const newApiSettings = created[0]?.settings as { create?: { onboardingRequired?: boolean } }
  const communitySettings = created[1]?.settings as { create?: { onboardingRequired?: boolean } }
  assert.equal(newApiSettings.create?.onboardingRequired, true)
  assert.equal(communitySettings.create?.onboardingRequired, undefined)
})
