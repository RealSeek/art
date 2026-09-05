import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('MiniMax 画质切换提交对应型号并保留系列', async ({ page }, testInfo) => {
  const models = ['', '[c]'].flatMap(prefix => ['480p', '720p', '2k', '2k-pro'].map(quality => ({
    key: `private:${prefix}${quality}`, upstreamModel: `${prefix}MiniMaxH3-${quality}`, displayName: `${prefix}MiniMaxH3 ${quality}`, capability: 'VIDEO', source: 'USER', isDefault: !prefix && quality === '480p', availability: 'AVAILABLE', vendor: { key: 'minimax', name: 'MiniMax' },
    options: { videoCapabilities: { resolutions: [quality === '480p' ? '480p' : '720p'], defaultResolution: quality === '480p' ? '480p' : '720p', durations: [5, 10] } },
  })))
  let submitted: Record<string, any> | undefined
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: { id: 'video-user', email: 'video@example.test', displayName: '视频测试', authMethod: 'password' } }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = {}
    else if (path.endsWith('/models')) body = models
    else if (path === '/v1/conversations' && route.request().method() === 'POST') body = { id: 'video-conversation', title: '测试视频', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] }
    else if (path.endsWith('/messages') && route.request().method() === 'POST') body = { id: 'video-message', createdAt: new Date().toISOString() }
    else if (path === '/v1/generations' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON()
      await route.fulfill({ status: 400, json: { message: '已截获测试请求' } })
      return
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/video')
  await page.getByRole('button', { name: '模型 MiniMax H3', exact: true }).click()
  await expect(page.getByRole('option')).toHaveCount(2)
  await page.getByRole('option', { name: /\[C\]MiniMax H3/ }).click()
  await page.getByRole('button', { name: /画质.*480p/ }).click()
  await expect(page.getByRole('button', { name: '2K Pro', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('video-quality-desktop.png') })
  await page.getByRole('button', { name: '720p', exact: true }).click()
  await expect(page.getByRole('button', { name: /画质.*720p/ })).toBeVisible()
  await page.getByRole('textbox', { name: '创作描述' }).fill('测试视频画质选择')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.model).toBe('private:[c]720p')
  expect(submitted?.options.resolution).toBe('720p')
  await page.getByRole('button', { name: /画质.*720p/ }).click()
  await page.getByRole('button', { name: '2K Pro', exact: true }).click()
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => submitted?.model).toBe('private:[c]2k-pro')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '模型 [C]MiniMax H3', exact: true }).click()
  await expect(page.getByRole('option')).toHaveCount(2)
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('video-model-mobile.png') })
  await page.getByRole('option', { name: /\[C\]MiniMax H3/ }).click()
  await page.getByRole('button', { name: /2K Pro/ }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: /2K Pro/ }).click()
  await expect(page.getByRole('button', { name: '480p', exact: true })).toBeVisible()
  await assertNoPageOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('video-quality-mobile.png') })
})
