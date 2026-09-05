import { expect, test, type Page } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

type ProvisionedCredential = {
  id: string
  name: string
  provisionKey: string
  providerType: 'NEW_API'
  baseUrl: string
  apiKeyHint: string
  authType: 'BEARER'
  enabled: boolean
  isDefault: boolean
  priority: number
  weight: number
}

async function mockFirstLoginApi(page: Page, options: { required?: boolean; role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN' } = {}) {
  const created: ProvisionedCredential[] = []
  const provisioningBodies: Array<{ group: string; name?: string }> = []
  const onboardingBodies: Array<Record<string, unknown>> = []
  let groupRequests = 0

  await page.addInitScript(() => {
    localStorage.setItem('flux:auth-session', JSON.stringify({
      id: 'new-user',
      email: 'new-user@onlycode.local',
      displayName: '新用户',
      provider: 'new-api',
      signedInAt: Date.now(),
    }))
  })
  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    if (path === '/v1/catalog/settings') return route.fulfill({ json: { siteName: 'OnlyArt', newApiLoginReady: true, userByokEnabled: true } })
    if (path === '/v1/auth/session') return route.fulfill({ json: { user: { id: 'new-user', email: 'new-user@onlycode.local', displayName: '新用户', authMethod: 'new-api' } } })
    if (path === '/v1/users/me/onboarding' && method === 'GET') return route.fulfill({ json: { required: options.required ?? true, experience: '', capabilities: [], completedAt: null } })
    if (path === '/v1/users/me/onboarding' && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>
      onboardingBodies.push(body)
      return route.fulfill({ json: { required: false, ...body, completedAt: new Date().toISOString() } })
    }
    if (path === '/v1/users/me/only-code-groups') {
      groupRequests += 1
      return route.fulfill({ json: [
        { name: 'chat-low', ratio: 0.1, models: ['gpt-5'], capabilities: ['CHAT'] },
        { name: 'image-low', ratio: 0.15, models: ['imagen-4'], capabilities: ['IMAGE'] },
        { name: 'gemini-all', ratio: 0.2, models: ['gemini-2.5-pro', 'imagen-4', 'veo-3'], capabilities: ['CHAT', 'IMAGE', 'VIDEO'] },
      ] })
    }
    if (path === '/v1/users/me/api-credentials/only-code' && method === 'POST') {
      const body = request.postDataJSON() as { group: string; name?: string }
      provisioningBodies.push(body)
      created.push({ id: `key-${created.length + 1}`, name: body.name || body.group, provisionKey: body.group, providerType: 'NEW_API', baseUrl: 'https://code.example/v1', apiKeyHint: '****', authType: 'BEARER', enabled: true, isDefault: false, priority: 0, weight: 100 })
      return route.fulfill({ json: { imported: 1, availableModels: [] } })
    }
    if (path === '/v1/users/me/api-credentials') return route.fulfill({ json: created })
    if (path === '/v1/users/me') return route.fulfill({ json: { id: 'new-user', displayName: '新用户', role: options.role || 'USER', settings: {} } })
    if (path === '/v1/users/me/only-code-balance') return route.fulfill({ json: { balance: 88, symbol: '$', displayType: 'USD' } })
    if (path === '/v1/users/me/model-policy') return route.fulfill({ json: { allowUserByok: true } })
    return route.fulfill({ json: [] })
  })

  return { provisioningBodies, onboardingBodies, getGroupRequests: () => groupRequests }
}

test('新用户可按用途创建推荐分组密钥并完成引导', async ({ page }, testInfo) => {
  const state = await mockFirstLoginApi(page)
  await page.goto('/chat')
  await expect(page.getByRole('heading', { name: '选择你的使用偏好' })).toBeVisible()

  await page.getByRole('button', { name: /新手上路/ }).click()
  await expect(page.getByRole('heading', { name: '选择你想使用的能力' })).toBeVisible()
  await page.getByRole('button', { name: /对话交互/ }).click()
  await page.getByRole('button', { name: /图片创作/ }).click()
  await page.getByRole('button', { name: /视频创作/ }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()

  const groups = page.locator('.onboarding-group-item')
  await expect(groups).toHaveCount(3)
  await expect(page.getByText('倍率: 0.1x')).toBeVisible()
  await expect(page.getByText('倍率: 0.15x')).toBeVisible()
  await expect(page.getByText('倍率: 0.2x')).toBeVisible()
  for (const checkbox of await groups.locator('input[type="checkbox"]').all()) await expect(checkbox).toBeChecked()
  await groups.filter({ hasText: 'gemini-all' }).getByPlaceholder('密钥名称').fill('我的视频密钥')
  await assertNoPageOverflow(page)
  await testInfo.attach('新手分组选择-桌面端', { body: await page.screenshot(), contentType: 'image/png' })

  await page.getByRole('button', { name: '创建所选密钥 (3)' }).click()
  await expect(page.getByText('已接入')).toHaveCount(3)
  expect(state.provisioningBodies).toEqual([
    { group: 'chat-low', name: 'onlyart-新用户-chat-low' },
    { group: 'image-low', name: 'onlyart-新用户-image-low' },
    { group: 'gemini-all', name: '我的视频密钥' },
  ])
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: '准备就绪，开启创作' })).toBeVisible()
  await assertNoPageOverflow(page)
  await testInfo.attach('欢迎页面-移动端', { body: await page.screenshot(), contentType: 'image/png' })

  await page.getByRole('button', { name: '进入工作台' }).click()
  await expect(page.locator('.onboarding-overlay')).toHaveCount(0)
  expect(state.onboardingBodies).toEqual([{ experience: 'BEGINNER', capabilities: ['CHAT', 'IMAGE', 'VIDEO'], complete: true }])
})

test('熟练用户直接跳到欢迎页且不请求分组', async ({ page }) => {
  const state = await mockFirstLoginApi(page)
  await page.goto('/chat')
  await page.getByRole('button', { name: /我有经验/ }).click()
  await expect(page.getByRole('heading', { name: '准备就绪，开启创作' })).toBeVisible()
  expect(state.getGroupRequests()).toBe(0)
  await page.getByRole('button', { name: '进入工作台' }).click()
  expect(state.onboardingBodies).toEqual([{ experience: 'EXPERIENCED', capabilities: ['CHAT', 'IMAGE', 'VIDEO'], complete: true }])
})

test('超级管理员可通过预览参数体验引导且不会产生写操作', async ({ page }, testInfo) => {
  const state = await mockFirstLoginApi(page, { required: false, role: 'SUPER_ADMIN' })
  await page.goto('/chat?onboarding=preview')

  await expect(page.getByText('预览模式', { exact: true })).toBeVisible()
  await expect(page.getByText('预览操作不会创建密钥或保存引导状态。')).toBeVisible()
  await expect(page.locator('.onboarding-card')).toHaveCSS('opacity', '1')
  const overlayCoversComposer = await page.evaluate(() => {
    const composer = document.querySelector('.chat-composer')
    if (!composer) return false
    const bounds = composer.getBoundingClientRect()
    const topElement = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    return Boolean(topElement?.closest('.onboarding-overlay'))
  })
  expect(overlayCoversComposer).toBe(true)
  await testInfo.attach('管理员引导预览', { body: await page.screenshot(), contentType: 'image/png' })
  await page.getByRole('button', { name: /新手上路/ }).click()
  await page.getByRole('button', { name: /对话交互/ }).click()
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '创建所选密钥 (1)' }).click()
  await expect(page.getByText('已接入')).toHaveCount(1)
  expect(state.provisioningBodies).toEqual([])

  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await page.getByRole('button', { name: '进入工作台' }).click()
  await expect(page.locator('.onboarding-overlay')).toHaveCount(0)
  expect(state.onboardingBodies).toEqual([])
})

test('普通用户不能通过预览参数打开引导', async ({ page }) => {
  await mockFirstLoginApi(page, { required: false, role: 'USER' })
  await page.goto('/chat?onboarding=preview')
  await expect(page.locator('.onboarding-overlay')).toHaveCount(0)
  await expect(page.getByText('预览模式', { exact: true })).toHaveCount(0)
})

test('手动添加和编辑密钥仅提交 OnlyCode 可编辑字段', async ({ page }, testInfo) => {
  await mockFirstLoginApi(page, { required: false })
  const credentials: Array<Record<string, unknown>> = []
  const bodies: Array<Record<string, unknown>> = []
  await page.route('**/v1/users/me/api-credentials**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const body = request.postDataJSON()
      bodies.push(body)
      credentials.push({ ...body, id: 'manual-key', name: 'OnlyCode-test', providerType: 'NEW_API', baseUrl: 'https://code.example/v1', authType: 'BEARER', apiKeyHint: '1234' })
      return route.fulfill({ json: credentials[0] })
    }
    if (request.method() === 'PATCH') {
      bodies.push(request.postDataJSON())
      return route.fulfill({ json: credentials[0] })
    }
    return route.fulfill({ json: credentials })
  })
  await page.goto('/chat?settings=api')
  await page.getByRole('button', { name: '手动填写密钥' }).first().click()
  const editor = page.locator('.settings-credential-editor')
  await expect(editor.getByRole('heading', { name: '添加 API 密钥' })).toBeVisible()
  await expect(editor.locator('select')).toHaveCount(0)
  await expect(editor.locator('input')).toHaveCount(6)
  await expect(editor).not.toContainText(/渠道模板|服务类型|API Base URL|认证方式|名称/)
  await editor.getByLabel('API 密钥', { exact: true }).fill('sk-test-1234')
  await editor.getByLabel('保存后自动识别并导入全部可用模型').uncheck()
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('onlycode-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('onlycode-mobile.png') })
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(bodies[0]).toEqual({ apiKey: 'sk-test-1234', enabled: true, isDefault: true, priority: 0, weight: 100, expiresAt: null })
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(editor.getByPlaceholder('留空保留 1234')).toBeVisible()
  await editor.getByLabel('权重', { exact: true }).fill('80')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(bodies[1]).toEqual({ enabled: true, isDefault: true, priority: 0, weight: 80, expiresAt: null })
})
