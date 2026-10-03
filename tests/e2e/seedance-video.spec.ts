import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('Seedance 2.5 自动时长和自适应比例随生成请求提交', async ({ page }) => {
  let submitted: Record<string, any> | undefined
  const models = [{ key: 'private:seedance-2.5', upstreamModel: 'Seedance-2.5', displayName: 'Seedance 2.5', capability: 'VIDEO', source: 'USER', isDefault: true, availability: 'AVAILABLE', vendor: { key: 'doubao', name: 'Doubao' }, options: { videoCapabilities: {
    resolutions: ['480p', '720p', '1080p'], durations: [4, 5, 10, 15, 20, 30], aspectRatios: ['16:9', 'adaptive'], defaultResolution: '720p', minDuration: 4, maxDuration: 30,
    maxReferences: 30, maxAudioReferences: 10, maxVideoReferences: 10, referenceMode: 'CONTENT_JSON', supportsAutoDuration: true, supportsVideoEditing: true, audioRequiresVisualReference: false,
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
  await page.getByRole('button', { name: '视频时长，当前为 5 秒', exact: true }).click()
  await expect(page.getByRole('button', { name: '30 秒', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '自动', exact: true }).click()
  await page.getByRole('button', { name: /比例.*16:9/ }).click()
  await page.getByRole('button', { name: 'adaptive', exact: true }).click()
  await expect(page.getByText('视频参考与生成设置', { exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: '创作描述' }).fill('把视频背景改成蓝色摄影棚')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  expect(submitted?.options).toMatchObject({ duration: -1, resolution: '720p', aspectRatio: 'adaptive' })
  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoPageOverflow(page)
})
