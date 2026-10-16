import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('Seedream 4.5 only offers 2K/4K and submits a valid landscape size with a reference', async ({ page }) => {
  const requests: Array<{ options: { size: string } }> = []
  const createdAt = new Date().toISOString()
  const model = { key: 'private:seedream', upstreamModel: 'seedream-4.5', displayName: 'Seedream 4.5', capability: 'IMAGE', source: 'USER', isDefault: true, availability: 'AVAILABLE', options: { imageCapabilities: {
    sizes: ['2048x2048', '2560x1440', '1440x2560', '2880x2880', '3840x2160'], defaultSize: '2048x2048', minPixels: 3_686_400, qualities: ['medium'], outputFormats: ['png'], backgrounds: ['opaque'], maxCount: 1, supportsReference: true,
  } } }
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: { id: 'seedream-user', email: 'seedream@example.test', displayName: 'Seedream test', authMethod: 'password' } }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = {}
    else if (path.endsWith('/models')) body = [model]
    else if (path === '/v1/conversations' && route.request().method() === 'POST') body = { id: 'seedream-conversation', model: model.key, createdAt, updatedAt: createdAt, messages: [] }
    else if (path.endsWith('/messages') && route.request().method() === 'POST') body = { id: 'seedream-message', createdAt }
    else if (path === '/v1/generations' && route.request().method() === 'POST') {
      const request = route.request().postDataJSON()
      requests.push(request)
      body = { ...request, id: 'seedream-job', status: 'QUEUED', createdAt }
    }
    else if (path === '/v1/generations/seedream-job') body = { id: 'seedream-job', status: 'QUEUED', kind: 'IMAGE', createdAt }
    await route.fulfill({ json: body })
  })
  await page.goto('/image')
  await page.getByRole('button', { name: '图片分辨率，当前为 2K', exact: true }).click()
  await expect(page.getByRole('button', { name: '1K', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '4K', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '2K', exact: true }).click()
  await page.getByRole('button', { name: '比例 自动', exact: true }).click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  const reference = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    canvas.getContext('2d')!.fillRect(0, 0, 160, 90)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(reference, 'base64') })
  await expect(page.getByRole('button', { name: '移除参考图片 reference.png', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '创作描述' }).fill('保留参考图构图')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0].options.size).toBe('2560x1440')
})

for (const kind of ['VIDEO', 'IMAGE'] as const) {
  test(`${kind} history reuses the creation composer and continues in the same conversation`, async ({ page }, testInfo) => {
    const requests: Array<{ kind: string; model: string; conversationId: string; prompt: string; options: Record<string, unknown> }> = []
    let createdConversations = 0
    const createdAt = new Date().toISOString()
    const models = [
      { key: 'chat-model', upstreamModel: 'chat-model', displayName: 'Chat model', capability: 'CHAT', source: 'PLATFORM', isDefault: true, availability: 'AVAILABLE' },
      { key: 'video-model', upstreamModel: 'seedance-2.0', displayName: 'Seedance 2.0', capability: 'VIDEO', source: 'PLATFORM', isDefault: true, availability: 'AVAILABLE', options: { videoCapabilities: {
        requestFormat: 'seedance', resolutions: ['720p', '1080p'], durations: [5, 10], aspectRatios: ['16:9', '9:16'], defaultResolution: '720p', defaultDuration: 5, maxReferences: 9, maxAudioReferences: 3, maxVideoReferences: 3,
      } } },
      { key: 'image-model', upstreamModel: 'image-model', displayName: 'Image model', capability: 'IMAGE', source: 'PLATFORM', isDefault: true, availability: 'AVAILABLE', options: { imageCapabilities: { sizes: ['1024x1024', '2048x2048'], maxCount: 4 } } },
    ]
    const jobs = [{ id: 'history-job', conversationId: 'creation-conversation', kind, status: 'SUCCEEDED', prompt: 'Original creation', model: kind === 'VIDEO' ? 'video-model' : 'image-model', options: { duration: 10, resolution: '1080p', aspectRatio: '9:16', size: '2048x2048', count: 2 }, createdAt, outputs: [{ asset: {
      id: 'result', title: 'Generated result', kind, mimeType: kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg', contentUrl: kind === 'VIDEO' ? '/assets/video-demo-flower.mp4' : '/assets/inspirations/video/culinary-detail.jpg', createdAt,
    } }] }]
    const conversation = () => ({ id: 'creation-conversation', title: 'Creation', model: jobs[0].model, createdAt, updatedAt: createdAt, messages: [{ id: 'user-message', role: 'USER', content: 'Original creation', createdAt }], generationJobs: jobs })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const method = route.request().method()
      let body: unknown = []
      if (path === '/v1/auth/session') body = { user: { id: 'creation-user', email: 'creation@example.test', displayName: 'Creation test', authMethod: 'password' } }
      else if (path === '/v1/auth/setup/status') body = { required: false }
      else if (path === '/v1/catalog/settings') body = {}
      else if (path.endsWith('/models')) body = models
      else if (path === '/v1/conversations' && method === 'POST') { createdConversations += 1; body = conversation() }
      else if (path === '/v1/conversations') body = [conversation()]
      else if (path === '/v1/conversations/creation-conversation') body = conversation()
      else if (path.endsWith('/messages') && method === 'POST') body = { id: `message-${requests.length}`, createdAt }
      else if (path === '/v1/generations' && method === 'POST') {
        const request = route.request().postDataJSON()
        requests.push(request)
        const job = { ...jobs[0], ...request, id: `follow-up-${requests.length}`, createdAt: new Date(Date.now() + requests.length * 1000).toISOString() }
        jobs.push(job)
        body = job
      }
      else if (path.startsWith('/v1/generations/')) body = jobs.find((job) => job.id === path.split('/').pop())
      else if (path === '/v1/generations') body = jobs
      await route.fulfill({ json: body })
    })
    await page.goto('/chat?generation=history-job')
    const composer = page.locator('#generation-conversation-composer')
    await expect(composer.locator('.creation-composer')).toBeVisible()
    await expect(page.locator('.chat-composer')).toHaveCount(0)
    await expect(page.locator('.chat-model-switcher')).toHaveCount(0)
    await expect(page.locator('.creation-heading, .creation-tools, .inspiration-section, .creation-output')).toHaveCount(0)
    await expect(page.getByRole('button', { name: `模型 ${kind === 'VIDEO' ? 'Seedance 2.0' : 'Image model'}`, exact: true })).toBeVisible()
    if (kind === 'VIDEO') {
      await expect(page.getByRole('button', { name: '画质 1080p', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '视频时长，当前为 10 秒', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '比例 9:16', exact: true })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: '图片分辨率，当前为 2K', exact: true })).toBeVisible()
    }
    const input = page.getByRole('textbox', { name: '创作描述' })
    await page.getByRole('button', { name: `模型 ${kind === 'VIDEO' ? 'Seedance 2.0' : 'Image model'}`, exact: true }).click()
    await page.getByRole('option', { name: kind === 'VIDEO' ? /^Seedance 2.0 / : /^Image model / }).click()
    await input.fill('Continue this creation')
    await page.getByRole('button', { name: '开始生成', exact: true }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0]).toMatchObject({ kind, conversationId: 'creation-conversation', model: kind === 'VIDEO' ? 'video-model' : 'image-model' })
    if (kind === 'IMAGE') {
      expect(requests[0].prompt).toBe('Original creation\n\n后续修改要求：Continue this creation')
      expect(requests[0].options).toMatchObject({ size: '2048x2048', count: 2, referenceAssetIds: ['result'] })
    } else {
      expect(requests[0].prompt).toBe('Continue this creation')
      expect(requests[0].options).toMatchObject({ resolution: '1080p', duration: 10, aspectRatio: '9:16' })
    }
    expect(createdConversations).toBe(0)
    await expect(page).toHaveURL(/generation=follow-up-1/)
    await expect(input).toBeEmpty()
    await page.screenshot({ path: testInfo.outputPath(`${kind.toLowerCase()}-conversation-desktop.png`) })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
    await expect(input).toBeVisible()
    await assertNoPageOverflow(page)
    const threadBounds = await page.locator('.chat-thread').boundingBox()
    const composerBounds = await composer.boundingBox()
    expect(threadBounds!.y + threadBounds!.height).toBeLessThanOrEqual(composerBounds!.y + 1)
    await page.screenshot({ path: testInfo.outputPath(`${kind.toLowerCase()}-conversation-mobile.png`) })
    await page.getByRole('button', { name: kind === 'VIDEO' ? '图片' : '视频', exact: true }).click()
    await expect(composer.locator('.creation-composer')).toHaveClass(kind === 'VIDEO' ? /creation-composer(?!.*is-video)/ : /is-video/)
    await input.fill('Switch creation type')
    await page.getByRole('button', { name: '开始生成', exact: true }).click()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1]).toMatchObject({ kind: kind === 'VIDEO' ? 'IMAGE' : 'VIDEO', conversationId: 'creation-conversation' })
    expect(createdConversations).toBe(0)
    await page.goto('/chat')
    await expect(page.locator('.chat-composer')).toBeVisible()
    await expect(page.locator('#generation-conversation-composer')).toHaveCount(0)
    await expect(page.locator('.api-page')).toHaveCount(0)
    await page.goto(kind === 'VIDEO' ? '/video' : '/image')
    await expect(page.locator('.creation-heading')).toHaveCount(1)
    await expect(page.locator('.creation-composer')).toBeVisible()
    await expect(page.locator('.api-page')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
