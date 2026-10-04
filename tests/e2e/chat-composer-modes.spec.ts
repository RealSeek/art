import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('new and existing conversations keep the model and capability controls without response modes', async ({ page }, testInfo) => {
  const createdAt = new Date().toISOString()
  let submitted: Record<string, unknown> | undefined
  const conversation = { id: 'chat-conversation', model: 'chat-model', title: 'Chat', createdAt, updatedAt: createdAt, messages: [{ id: 'user-message', role: 'USER', content: 'Hello', createdAt }, { id: 'assistant-message', role: 'ASSISTANT', content: 'Hello back', model: 'chat-model', createdAt }], generationJobs: [] }
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: { id: 'chat-user', role: 'USER', email: 'chat@example.test', displayName: 'Chat test', authMethod: 'password' } }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = { chatUiPreset: 'doubao' }
    else if (path.endsWith('/models')) body = [{ key: 'chat-model', upstreamModel: 'chat-model', displayName: 'Chat model', capability: 'CHAT', source: 'PLATFORM', isDefault: true, availability: 'AVAILABLE' }]
    else if (path === '/v1/conversations' && route.request().method() === 'POST') body = conversation
    else if (path === '/v1/conversations') body = [conversation]
    else if (path === '/v1/conversations/chat-conversation') body = conversation
    else if (path.endsWith('/messages') && route.request().method() === 'POST') body = { id: 'message-2', createdAt }
    else if (path === '/v1/generations' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON()
      await route.fulfill({ status: 400, json: { message: 'Test request captured' } })
      return
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/chat')
  const composer = page.locator('.chat-composer')
  await expect(composer).toBeVisible()
  await expect(page.locator('.chat-home-mode-trigger, .chat-kimi-modes, .chat-home-mode-menu')).toHaveCount(0)
  await expect(composer.getByRole('button', { name: /选择模型，当前为Chat model/ })).toBeVisible()
  await expect(composer.getByRole('button', { name: /对话能力/ })).toBeVisible()
  await composer.getByRole('textbox', { name: '消息' }).fill('Hello')
  await composer.getByRole('button', { name: '发送', exact: true }).click()
  await expect.poll(() => submitted).toMatchObject({ kind: 'CHAT', model: 'chat-model', options: { responseMode: 'fast' } })
  await expect(page.locator('.chat-thread')).toBeVisible()
  await expect(page.locator('.chat-home-mode-trigger, .chat-kimi-modes, .chat-home-mode-menu')).toHaveCount(0)
  await expect(composer.getByRole('button', { name: /选择模型，当前为Chat model/ })).toBeVisible()
  await composer.getByRole('button', { name: /选择模型，当前为Chat model/ }).click()
  await expect(page.getByRole('dialog', { name: '选择模型' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: testInfo.outputPath('chat-composer-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('chat-composer-mobile.png') })
})
