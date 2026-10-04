import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('office composer keeps tools and submits without a visible response mode selector', async ({ page }, testInfo) => {
  let submitted: Record<string, unknown> | undefined
  const createdAt = new Date().toISOString()
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: { id: 'office-user', email: 'office@example.test', displayName: 'Office test', authMethod: 'password' } }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = {}
    else if (path.endsWith('/models')) body = [{ key: 'office-model', upstreamModel: 'office-model', displayName: 'Office model', capability: 'CHAT', source: 'PLATFORM', enabled: true, isDefault: true, availability: 'AVAILABLE' }]
    else if (path === '/v1/conversations' && route.request().method() === 'POST') body = { id: 'office-conversation', createdAt, updatedAt: createdAt }
    else if (path.endsWith('/messages') && route.request().method() === 'POST') body = { id: 'office-message', createdAt }
    else if (path === '/v1/generations' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON()
      await route.fulfill({ status: 400, json: { message: 'Test request captured' } })
      return
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/office')
  const composer = page.locator('.office-composer')
  await expect(composer.getByRole('button', { name: /快速|专家|^任务$/ })).toHaveCount(0)
  await expect(composer.locator('.office-model-button')).toContainText('Office model')
  for (const name of ['PPT 生成', 'AI 表格', '帮我写作', '会议纪要', '自动格式', '更多']) {
    await expect(composer.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await composer.getByRole('button', { name: '自动格式', exact: true }).click()
  await page.getByRole('button', { name: /Word.*可编辑的 DOCX/ }).click()
  await expect(composer.getByRole('button', { name: 'Word', exact: true })).toBeVisible()
  await composer.getByRole('textbox').fill('Organize the meeting notes')
  await composer.getByRole('button', { name: '提交任务', exact: true }).click()
  await expect.poll(() => submitted).toMatchObject({ kind: 'CHAT', model: 'office-model', conversationId: 'office-conversation', prompt: 'Organize the meeting notes' })
  await expect(page.locator('.office-assistant-message > header > small')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('office-composer-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await expect(composer).toBeVisible()
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('office-composer-mobile.png') })
})
