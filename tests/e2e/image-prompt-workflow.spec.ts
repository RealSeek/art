import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('image prompt selects models, restores history and continues in chat', async ({ page }, testInfo) => {
  const now = new Date().toISOString()
  const asset = { id: 'source-image', name: 'Reference.jpg', kind: 'IMAGE', mimeType: 'image/jpeg', size: 1024, contentUrl: '/v1/assets/source-image/content', createdAt: now }
  const models = ['vision-one', 'vision-two'].map((name) => ({ key: `private:${name}`, upstreamModel: name, displayName: name, source: 'USER', capability: 'CHAT', isDefault: name === 'vision-one', availability: 'AVAILABLE', vendor: { key: 'other', name: 'Other' } }))
  const result = { prompt: 'A landscape with clear sunlight', negativePrompt: 'Blur', summary: 'Landscape', tags: [], structured: {}, raw: '', mode: 'GENERAL', language: 'zh-CN' }
  const finished = { id: 'success-job', kind: 'CHAT', model: 'vision-two', status: 'SUCCEEDED', creditCost: 0, createdAt: now, options: { taskType: 'IMAGE_PROMPT_EXTRACTION', assetId: asset.id, mode: 'GENERAL', language: 'zh-CN', requestedModel: 'private:vision-two', imagePromptResult: result } }
  const failed = { ...finished, id: 'failed-job', status: 'FAILED', errorMessage: '模型分析失败', options: { ...finished.options, imagePromptResult: undefined } }
  const active = { ...failed, id: 'active-job', status: 'RUNNING', errorMessage: null }
  let submitted: Record<string, unknown> | undefined
  let continuation = false
  let historyUnavailable = false
  let imageDeleted = false
  let monitorUnavailable = false
  const conversation = { id: 'continued-chat', title: 'Landscape', model: 'private:vision-two', createdAt: now, updatedAt: now, messages: [{ id: 'source', role: 'USER', content: '分析这张图片', attachments: [{ assetId: asset.id }], createdAt: now }, { id: 'answer', role: 'ASSISTANT', content: result.prompt, model: 'vision-two', createdAt: now }], generationJobs: [] }
  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: { id: 'test-user', role: 'USER', displayName: 'Test', email: 'test@example.test', authMethod: 'password' } }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = { imagePromptEnabled: true }
    else if (path === '/v1/generations/image-prompt/models') body = { models, defaultModel: 'private:vision-one' }
    else if (path.endsWith('/models')) body = models
    else if (path === '/v1/assets/source-image/content') { await route.fulfill({ contentType: 'image/jpeg', path: 'public/assets/inspiration-1.jpg' }); return }
    else if (path === '/v1/assets/source-image') {
      if (imageDeleted) { await route.fulfill({ status: 404, json: { message: '原图已删除' } }); return }
      body = asset
    }
    else if (path === '/v1/assets/uploads') body = asset
    else if (path === '/v1/assets') body = [asset]
    else if (path === '/v1/generations' && request.method() === 'POST') { submitted = request.postDataJSON(); body = { ...finished, status: 'QUEUED' } }
    else if (path.endsWith('/events')) {
      if (monitorUnavailable) { await route.fulfill({ status: 503, json: { message: '任务监控暂不可用' } }); return }
      await route.fulfill({ contentType: 'text/event-stream', body: `event: job\ndata: ${JSON.stringify(finished)}\n\n` }); return
    }
    else if (path === '/v1/generations' && url.searchParams.get('taskType')) {
      if (historyUnavailable) { await route.fulfill({ status: 503, json: { message: '历史暂不可用' } }); return }
      body = [finished, failed, active]
    }
    else if (path === '/v1/generations/success-job') body = finished
    else if (path === '/v1/generations/failed-job') body = failed
    else if (path === '/v1/generations/active-job') {
      if (monitorUnavailable) { await route.fulfill({ status: 503, json: { message: '任务监控暂不可用' } }); return }
      body = active
    }
    else if (path === '/v1/generations/success-job/conversation') { continuation = true; body = { id: conversation.id } }
    else if (path === '/v1/conversations' && !url.searchParams.has('archived')) body = continuation ? [conversation] : []
    else if (path === `/v1/conversations/${conversation.id}`) body = conversation
    await route.fulfill({ json: body })
  })

  await page.goto('/image-prompt')
  await page.getByRole('button', { name: 'vision-one', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择对话模型' })
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('image-prompt-model-desktop.png') })
  await picker.getByRole('option', { name: /vision-two/ }).click()
  await page.locator('input[type=file]').setInputFiles('public/assets/inspiration-1.jpg')
  await expect(page.locator('.image-prompt-dropzone img')).toBeVisible()
  await expect.poll(() => page.locator('.image-prompt-dropzone img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.getByRole('button', { name: '开始反推', exact: true }).click()
  await expect(page.locator('.image-prompt-result')).toContainText(result.prompt)
  expect(submitted).toMatchObject({ model: 'private:vision-two', options: { taskType: 'IMAGE_PROMPT_EXTRACTION', assetId: asset.id, mode: 'GENERAL' } })
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('image-prompt-result-desktop.png') })

  await page.reload()
  await page.getByRole('button', { name: '反推历史', exact: true }).click()
  const history = page.getByRole('dialog', { name: '反推历史' })
  await expect(history.getByRole('button', { name: /Landscape.*已完成/ })).toBeVisible()
  expect(await history.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: testInfo.outputPath('image-prompt-history-desktop.png') })
  await history.getByRole('button', { name: /图片反推.*失败/ }).click()
  await expect(page.getByRole('alert')).toContainText('模型分析失败')
  await expect(page.getByRole('button', { name: '重新提取', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '反推历史', exact: true }).click()
  await history.getByRole('button', { name: /图片反推.*分析中/ }).click()
  await expect(page.locator('.image-prompt-result')).toContainText(result.prompt)

  let activeReads = 0
  await page.route('**/v1/generations/active-job', async (route) => {
    activeReads += 1
    if (activeReads > 1) await route.fulfill({ status: 503, json: { message: '任务监控暂不可用' } })
    else await route.fulfill({ json: active })
  })
  monitorUnavailable = true
  await page.getByRole('button', { name: '反推历史', exact: true }).click()
  await history.getByRole('button', { name: /图片反推.*分析中/ }).click()
  await expect(page.locator('.image-prompt-error')).toContainText('任务监控暂不可用')
  monitorUnavailable = false

  historyUnavailable = true
  await page.getByRole('button', { name: '反推历史', exact: true }).click()
  await expect(history.getByRole('alert')).toContainText('历史暂不可用')
  historyUnavailable = false
  await history.getByRole('button', { name: '重新加载', exact: true }).click()
  imageDeleted = true
  await history.getByRole('button', { name: /Landscape.*已完成/ }).click()
  await expect(page.getByRole('alert')).toContainText('原图无法恢复')
  await expect(page.locator('.image-prompt-result')).toContainText(result.prompt)
  await expect(page.getByRole('button', { name: '开始反推', exact: true })).toBeDisabled()
  imageDeleted = false
  await page.getByRole('button', { name: '反推历史', exact: true }).click()
  await history.getByRole('button', { name: /Landscape.*已完成/ }).click()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: 'vision-two', exact: true }).click()
  await expect(picker).toBeVisible()
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('image-prompt-model-mobile.png') })
  await page.getByRole('button', { name: '关闭模型选择', exact: true }).click()
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('image-prompt-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: '反推历史', exact: true }).click()
  await expect(history).toBeVisible()
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('image-prompt-history-mobile.png') })
  await history.getByRole('button', { name: '关闭反推历史', exact: true }).click()
  await page.getByRole('button', { name: '继续对话', exact: true }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.chat-thread')).toContainText(result.prompt)
  expect(continuation).toBe(true)
})
