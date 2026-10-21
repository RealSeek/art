import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('Seedance 2.5 自动时长和渠道固定时长随模型切换提交', async ({ page }, testInfo) => {
  let submitted: Record<string, any> | undefined
  await page.addInitScript(() => {
    if (!localStorage.getItem('flux:settings')) localStorage.setItem('flux:settings', JSON.stringify({ appearance: '深色', language: 'zh-CN' }))
  })
  const models = [{ key: 'private:seedance-2.5', upstreamModel: 'Seedance-2.5', displayName: 'Seedance 2.5', capability: 'VIDEO', source: 'USER', isDefault: true, availability: 'AVAILABLE', vendor: { key: 'doubao', name: 'Doubao' }, options: { videoCapabilities: {
    resolutions: ['480p', '720p', '1080p'], durations: [4, 5, 10, 15, 20, 30], aspectRatios: ['16:9', 'adaptive'], defaultResolution: '720p', minDuration: 4, maxDuration: 30,
    maxReferences: 30, maxFirstLastFrames: 2, maxAudioReferences: 10, maxVideoReferences: 10, referenceMode: 'CONTENT_JSON', requestFormat: 'seedance', supportsAutoDuration: true, supportsVideoEditing: true, audioRequiresVisualReference: false,
  } } }]
  models.push({ ...models[0], key: 'private:channel-seedance-2.5', upstreamModel: '[C]Seedance 2.5', displayName: '[C]Seedance 2.5', isDefault: false,
    options: { videoCapabilities: { ...models[0].options.videoCapabilities, resolutions: ['720p'], durations: [30], minDuration: 30, maxDuration: 30, supportsAutoDuration: false } },
  })
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
  await page.getByRole('button', { name: '视频时长，当前为 5 秒', exact: true }).click()
  await expect(page.getByRole('button', { name: '30 秒', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '自动', exact: true }).click()
  await page.getByRole('button', { name: /比例.*16:9/ }).click()
  await page.getByRole('button', { name: 'adaptive', exact: true }).click()
  await expect(page.getByText('视频参考与生成设置', { exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: '创作描述' }).fill('把视频背景改成蓝色摄影棚')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.options).toMatchObject({ duration: -1, resolution: '720p', aspectRatio: 'adaptive' })
  await page.getByRole('button', { name: '比例 adaptive', exact: true }).click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  await page.getByRole('button', { name: '视频生成设置', exact: true }).click()
  await page.getByRole('combobox', { name: '图片用途', exact: true }).selectOption('first_last_frame')
  await expect(page.getByRole('button', { name: '比例 adaptive', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '图片用途', exact: true }).getByRole('option', { name: '尾帧', exact: true })).toHaveCount(0)
  const imageUrls = page.getByRole('textbox', { name: '图片链接', exact: true })
  await imageUrls.fill('https://example.test/first.png\nhttps://example.test/last.png')
  await imageUrls.press('Tab')
  await page.getByRole('switch', { name: '生成音频', exact: true }).uncheck()
  await page.getByRole('switch', { name: '视频水印', exact: true }).check()
  await page.getByRole('switch', { name: '返回尾帧图片', exact: true }).check()
  await page.getByRole('combobox', { name: '视频格式', exact: true }).selectOption('mov')
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('video-settings-desktop.png') })
  await page.getByRole('textbox', { name: '创作描述' }).fill('从首帧自然过渡到尾帧')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.options).toMatchObject({ imageRole: 'first_last_frame', aspectRatio: 'adaptive', generateAudio: false, watermark: true, returnLastFrame: true, videoFormat: 'mov', referenceImageUrls: ['https://example.test/first.png', 'https://example.test/last.png'] })
  await page.getByRole('button', { name: '视频生成设置', exact: true }).click()
  await page.getByRole('combobox', { name: '视频模式', exact: true }).selectOption('edit')
  await expect(page.getByRole('combobox', { name: '图片用途', exact: true })).toHaveValue('reference_image')
  await expect(page.getByRole('button', { name: '视频时长，当前为 自动', exact: true })).toBeDisabled()
  await imageUrls.fill('')
  await imageUrls.press('Tab')
  const videoUrls = page.getByRole('textbox', { name: '视频链接', exact: true })
  await videoUrls.fill('https://example.test/source.mp4')
  await videoUrls.press('Tab')
  await page.getByRole('textbox', { name: '创作描述' }).fill('把视频背景改成蓝色摄影棚')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.options).toMatchObject({ videoTaskType: 'edit', imageRole: 'reference_image', duration: -1, aspectRatio: 'adaptive', referenceVideoUrls: ['https://example.test/source.mp4'] })
  await page.getByRole('button', { name: '视频生成设置', exact: true }).click()
  await page.getByRole('combobox', { name: '视频模式', exact: true }).selectOption('auto')
  await videoUrls.fill('')
  await videoUrls.press('Tab')
  await page.getByRole('button', { name: '视频生成设置', exact: true }).click()
  await page.getByRole('button', { name: '画质 720p', exact: true }).click()
  await page.getByRole('button', { name: '1080p', exact: true }).click()
  await page.getByRole('button', { name: '模型 Seedance 2.5', exact: true }).click()
  await page.getByRole('option', { name: /^\[C\]Seedance 2.5 / }).click()
  await page.getByRole('button', { name: '画质 720p', exact: true }).click()
  await expect(page.getByRole('button', { name: '720p', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '480p', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '1080p', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '720p', exact: true }).click()
  await expect(page.getByRole('button', { name: '视频时长，当前为 30 秒', exact: true })).toBeDisabled()
  await expect(page.getByRole('spinbutton', { name: '自定义视频秒数' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('fixed-duration-desktop.png') })
  await page.getByRole('textbox', { name: '创作描述' }).fill('生成一个 30 秒的视频')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.options.duration).toBe(30)
  expect(submitted?.options.resolution).toBe('720p')
  expect(submitted?.model).toBe('private:channel-seedance-2.5')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('fixed-duration-mobile.png') })
  for (const [appearance, theme] of [['深色', 'dark'], ['浅色', 'light']] as const) {
    await page.evaluate((appearance) => {
      const settings = JSON.parse(localStorage.getItem('flux:settings') || '{}')
      localStorage.setItem('flux:settings', JSON.stringify({ ...settings, appearance, language: 'zh-CN' }))
    }, appearance)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-studio-theme', theme)
    await page.getByRole('button', { name: '视频生成设置', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '图片用途', exact: true })).toBeVisible()
    await assertNoPageOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`video-settings-mobile-${theme}.png`) })
  }
})
