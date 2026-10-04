import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { assertNoPageOverflow } from './helpers'

test.use({ hasTouch: true })

type SubmittedGeneration = {
  prompt: string
  options: {
    referenceImages: Array<{ dataUrl: string }>
    referenceAudios: Array<{ dataUrl: string }>
  }
}

test('video materials stack, expand, quote and renumber without changing submitted sources', async ({ page }, testInfo) => {
  let submitted: SubmittedGeneration | undefined
  const models = [{ key: 'private:seedance', upstreamModel: 'seedance-2.0', displayName: 'Seedance 2.0', capability: 'VIDEO', source: 'USER', isDefault: true, availability: 'AVAILABLE', options: { videoCapabilities: {
    requestFormat: 'seedance', referenceMode: 'CONTENT_JSON', resolutions: ['720p'], durations: [5], aspectRatios: ['16:9'], defaultResolution: '720p', defaultDuration: 5,
    maxReferences: 9, maxAudioReferences: 3, maxFirstLastFrames: 2, maxVideoReferences: 3,
  } } }]
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: { id: 'video-user', email: 'video@example.test', displayName: 'Video test', authMethod: 'password' } }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = {}
    else if (path.endsWith('/models')) body = models
    else if (path === '/v1/conversations' && route.request().method() === 'POST') body = { id: 'conversation-1', title: 'Video', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] }
    else if (path.endsWith('/messages') && route.request().method() === 'POST') body = { id: 'message-1', createdAt: new Date().toISOString() }
    else if (path === '/v1/generations' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON()
      await route.fulfill({ status: 400, json: { message: 'Test request captured' } })
      return
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/video')
  const input = page.getByRole('textbox', { name: '创作描述' })
  await expect(input).toHaveAttribute('data-placeholder', /上传参考素材/)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '添加参考素材', exact: true }).click()
  await (await chooser).setFiles([
    { name: 'flowers.jpg', mimeType: 'image/jpeg', buffer: await readFile('public/assets/inspirations/video/culinary-detail.jpg') },
    { name: 'boat.jpg', mimeType: 'image/jpeg', buffer: await readFile('public/assets/inspirations/video/artisan-pottery.jpg') },
  ])
  await expect(page.locator('.video-reference-deck__item')).toHaveCount(2)
  await expect(page.locator('.creation-attachments')).toHaveCount(0)
  await expect(input).toHaveAttribute('data-placeholder', /使用 @ 快速调用参考内容/)
  await page.locator('.creation-heading').hover()
  await page.screenshot({ path: testInfo.outputPath('stacked-materials-desktop.png') })
  await page.locator('.video-reference-stack').hover()
  await expect(page.getByRole('button', { name: '引用 flowers.jpg', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '引用 boat.jpg', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('expanded-materials.png') })
  await input.fill('让 ')
  await input.press('End')
  await input.pressSequentially('@')
  await expect(page.getByRole('listbox', { name: '可引用的内容' })).toBeVisible()
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(input.locator('[data-reference="@参考图1"]')).toHaveText('boat.jpg')
  await expect(page.getByRole('button', { name: '预览 boat.jpg' })).toBeVisible()
  await page.getByRole('button', { name: '预览 boat.jpg' }).hover()
  await expect(page.getByRole('tooltip').getByAltText('boat.jpg')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('quoted-reference-desktop.png') })
  await page.evaluate(() => { document.documentElement.dataset.studioTheme = 'dark' })
  await page.screenshot({ path: testInfo.outputPath('quoted-reference-desktop-dark.png') })
  await page.evaluate(() => { document.documentElement.dataset.studioTheme = 'light' })
  await input.press('Control+z')
  await expect(input.locator('[data-reference]')).toHaveCount(0)
  await input.press('Control+Shift+z')
  await expect(input.locator('[data-reference]')).toHaveCount(1)
  await input.fill('')
  await input.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    element.textContent = '角色跳舞'
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '角色跳舞' }))
  })
  await expect(input).toHaveText('角色跳舞')
  await input.pressSequentially('@')
  await expect(page.getByRole('listbox', { name: '可引用的内容' })).toBeVisible()
  await input.press('Enter')
  await expect(input.locator('[data-reference]')).toHaveCount(1)
  await input.fill('@参考图1')
  await input.press('End')
  await input.press('Backspace')
  await expect(input.locator('[data-reference]')).toHaveCount(0)
  await input.press('Control+z')
  await expect(input.locator('[data-reference]')).toHaveCount(1)
  await input.press('End')
  await input.press('Enter')
  await input.pressSequentially('motion')
  await expect(input).toContainText('motion')
  await expect(input.locator('[data-reference]')).toHaveCount(1)

  const videoChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '添加参考视频', exact: true }).click()
  await (await videoChooser).setFiles([
    { name: 'motion-first.mp4', mimeType: 'video/mp4', buffer: await readFile('public/assets/video-demo-flower.mp4') },
    { name: 'motion-second.mp4', mimeType: 'video/mp4', buffer: await readFile('public/assets/video-demo-flower.mp4') },
  ])
  await input.fill('@参考视频1')
  await expect(input.locator('[data-reference]')).toHaveText('motion-second.mp4')
  await page.locator('.video-reference-stack').hover()
  await page.getByRole('button', { name: '移除参考视频0 motion-first.mp4' }).click()
  await expect(input.locator('[data-reference="@参考视频0"]')).toHaveText('motion-second.mp4')
  await page.getByRole('button', { name: '移除参考视频0 motion-second.mp4' }).click()
  await expect(input.locator('[data-reference]')).toHaveCount(0)

  const audioChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '添加参考音频', exact: true }).click()
  await (await audioChooser).setFiles([
    { name: 'beat.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('test-audio-1') },
    { name: 'voice.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('test-audio-2') },
  ])
  await input.fill('@参考图1 跟随 @参考音频1 摇摆')
  await expect(input.locator('[data-reference]')).toHaveCount(2)
  await page.locator('.video-reference-stack').hover()
  await page.getByRole('button', { name: '移除参考图0 flowers.jpg' }).click()
  await expect(input.locator('[data-reference="@参考图0"]')).toHaveText('boat.jpg')
  await page.getByRole('button', { name: '移除参考音频0 beat.mp3' }).click()
  await expect(input.locator('[data-reference="@参考音频0"]')).toHaveText('voice.mp3')
  await input.click()
  await page.getByRole('button', { name: '引用参考内容' }).click()
  await expect(page.getByRole('listbox', { name: '可引用的内容' })).toBeVisible()
  await page.getByRole('option', { name: '引用 boat.jpg' }).click()
  await expect(page.getByRole('button', { name: '预览 boat.jpg' })).toHaveCount(1)
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.options.referenceImages?.length).toBe(1)
  expect(submitted?.prompt).toContain('@参考图0')
  expect(submitted?.prompt).toContain('@参考音频0')
  expect(submitted?.prompt).not.toContain('boat.jpg')
  expect(submitted?.options.referenceImages[0].dataUrl).toMatch(/^data:image\//)
  expect(submitted?.options.referenceAudios[0].dataUrl).toMatch(/^data:audio\//)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await input.click()
  const deck = await page.getByRole('button', { name: '展开参考素材' }).boundingBox()
  await page.touchscreen.tap(deck!.x + deck!.width / 2, deck!.y + deck!.height / 2)
  await expect(page.getByLabel('已上传参考素材')).toBeVisible()
  const expanded = await page.getByLabel('已上传参考素材').boundingBox()
  const prompt = await input.boundingBox()
  expect(expanded!.y + expanded!.height).toBeLessThanOrEqual(prompt!.y)
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('quoted-reference-mobile.png') })
  await page.evaluate(() => { document.documentElement.dataset.studioTheme = 'dark' })
  await page.screenshot({ path: testInfo.outputPath('quoted-reference-mobile-dark.png') })
  await input.click()
  await page.getByRole('button', { name: '引用参考内容' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '引用参考内容' }).click()
  await expect(page.getByRole('listbox', { name: '可引用的内容' })).toBeVisible()
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('reference-menu-mobile-dark.png') })
})
