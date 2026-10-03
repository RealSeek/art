import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('MiniMax 本地参考图和音频可上传、预览并随视频请求提交', async ({ page }, testInfo) => {
  let submitted: Record<string, any> | undefined
  const models = [{ key: 'private:minimax-h3', upstreamModel: 'MiniMax-H3', displayName: 'MiniMax H3', capability: 'VIDEO', source: 'USER', isDefault: true, availability: 'AVAILABLE', options: { videoCapabilities: {
    requestFormat: 'minimax-h3', referenceMode: 'CONTENT_JSON', requiresPublicReferenceUrls: true,
    resolutions: ['768p'], durations: [5], aspectRatios: ['16:9'], defaultResolution: '768p', defaultDuration: 5,
    maxReferences: 9, maxAudioReferences: 3, maxFirstLastFrames: 2, maxVideoReferences: 3,
  } } }]
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: { id: 'video-user', email: 'video@example.test', displayName: '视频测试', authMethod: 'password' } }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = {}
    else if (path.endsWith('/models')) body = models
    else if (path === '/v1/conversations' && route.request().method() === 'POST') body = { id: 'conversation-1', title: '视频', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] }
    else if (path.endsWith('/messages') && route.request().method() === 'POST') body = { id: 'message-1', createdAt: new Date().toISOString() }
    else if (path === '/v1/generations' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON()
      await route.fulfill({ status: 400, json: { message: '已截获测试请求' } })
      return
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/video')
  const imageChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '添加参考素材', exact: true }).click()
  await (await imageChooser).setFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })
  await expect(page.getByText('参考图0', { exact: true })).toBeVisible()
  const audioChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '添加参考音频', exact: true }).click()
  await (await audioChooser).setFiles({ name: 'reference.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('test-audio') })
  await expect(page.getByText('参考音频0', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '创作描述' }).fill('@参考图0 角色随 @参考音频0 跳舞')
  await page.screenshot({ path: testInfo.outputPath('temporary-references-desktop.png') })
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.options.referenceImages?.length).toBe(1)
  expect(submitted?.options.referenceImages[0].dataUrl).toMatch(/^data:image\//)
  expect(submitted?.options.referenceAudios[0].dataUrl).toMatch(/^data:audio\/mpeg;base64,/)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await assertNoPageOverflow(page)
  await expect(page.getByRole('button', { name: '添加参考音频', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('temporary-references-mobile.png') })
})
