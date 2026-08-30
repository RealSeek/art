import { expect, test, type Page } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

async function mockPublicBootstrap(page: Page) {
  await page.route('**/v1/auth/session', (route) => route.fulfill({ json: { user: null } }))
  await page.route('**/v1/auth/setup/status', (route) => route.fulfill({ json: { required: false } }))
  await page.route('**/v1/catalog/settings', (route) => route.fulfill({ json: {} }))
  await page.route('**/v1/catalog/external-links', (route) => route.fulfill({ json: [] }))
}

test('作品中心直达路由稳定，加载失败后可以重试恢复', async ({ page }) => {
  await mockPublicBootstrap(page)
  let galleryRequests = 0
  await page.route('**/v1/gallery?**', async (route) => {
    galleryRequests += 1
    if (galleryRequests === 1) {
      await route.fulfill({ status: 503, json: { message: '作品服务暂时不可用' } })
      return
    }
    await route.fulfill({
      json: {
        items: [{
          id: 'qa-work',
          slug: 'qa-work',
          isFeatured: false,
          viewCount: 2,
          likeCount: 1,
          publishedAt: new Date().toISOString(),
          author: { id: 'qa-author', name: 'QA 用户', followerCount: 0 },
          version: {
            id: 'qa-version',
            versionNumber: 1,
            title: '恢复后的作品',
            description: '重试成功后展示',
            category: '创意作品',
            tags: [],
            visibility: 'PUBLIC',
            authorDisplay: 'PROFILE',
            customAuthor: '',
            publicPrompt: '',
            moderationStatus: 'APPROVED',
            rejectionReason: '',
            assets: [],
          },
        }],
        nextCursor: null,
      },
    })
  })

  await page.goto('/works')
  await expect(page).toHaveURL(/\/works(?:\?|$)/)
  await expect(page.getByRole('heading', { name: '作品中心', exact: true })).toBeVisible()
  await expect(page.locator('.works-load-error')).toContainText('作品服务暂时不可用')
  await expect(page.getByText('还没有公开作品', { exact: true })).toHaveCount(0)

  await page.locator('.works-load-error').getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('恢复后的作品', { exact: true })).toBeVisible()
  await expect(page.locator('.works-load-error')).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  const searchButton = await page.getByRole('button', { name: '搜索作品' }).boundingBox()
  expect(searchButton).not.toBeNull()
  expect(searchButton!.height).toBeGreaterThanOrEqual(44)
  await assertNoPageOverflow(page)

  await page.reload()
  await expect(page).toHaveURL(/\/works(?:\?|$)/)
  await expect(page.getByText('恢复后的作品', { exact: true })).toBeVisible()
})

test('初始化状态探测失败时保留目标路由而不是误跳安装页', async ({ page }) => {
  await page.route('**/v1/auth/session', (route) => route.fulfill({ json: { user: null } }))
  await page.route('**/v1/auth/setup/status', (route) => route.fulfill({ status: 503, json: { message: '初始化状态暂时不可用' } }))
  await page.route('**/v1/catalog/settings', (route) => route.fulfill({ json: {} }))
  await page.route('**/v1/catalog/external-links', (route) => route.fulfill({ json: [] }))
  await page.route('**/v1/gallery?**', (route) => route.fulfill({ json: { items: [], nextCursor: null } }))

  await page.goto('/works')
  await expect(page).toHaveURL(/\/works(?:\?|$)/)
  await expect(page.getByRole('heading', { name: '作品中心', exact: true })).toBeVisible()
  await expect(page).not.toHaveURL(/\/install/)
})

test('灵感接口失败时显示真实错误，重试后恢复且不注入示例卡片', async ({ page }) => {
  await mockPublicBootstrap(page)
  let imageInspirationRequests = 0
  await page.route('**/v1/users/me/models**', (route) => route.fulfill({
    json: [{ key: 'qa-image', displayName: 'QA Image', upstreamModel: 'qa-image', capability: 'IMAGE', enabled: true, isDefault: true, flatCreditCost: 1 }],
  }))
  await page.route('**/v1/inspirations?**', async (route) => {
    const mode = new URL(route.request().url()).searchParams.get('mode')
    if (mode === 'IMAGE_TOOL') {
      await route.fulfill({ json: [] })
      return
    }
    if (mode === 'IMAGE') {
      imageInspirationRequests += 1
      if (imageInspirationRequests === 1) {
        await route.fulfill({ status: 503, json: { message: '灵感服务暂时不可用' } })
        return
      }
      await route.fulfill({
        json: [{ id: 'qa-inspiration', title: '恢复后的灵感', imageUrl: '/assets/inspiration-1.jpg', prompt: 'QA prompt', badge: 'QA' }],
      })
      return
    }
    await route.fulfill({ json: [] })
  })

  await page.goto('/image')
  await expect(page.locator('.inspiration-error')).toContainText('灵感服务暂时不可用')
  await expect(page.locator('.inspiration-card')).toHaveCount(0)
  await expect(page.getByText('未来感商业海报', { exact: true })).toHaveCount(0)

  await page.locator('.inspiration-error').getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByRole('button', { name: '查看灵感：恢复后的灵感' })).toBeVisible()
  await expect(page.locator('.inspiration-error')).toHaveCount(0)
})

test('灵感接口成功返回空列表时结束骨架并显示空状态', async ({ page }) => {
  await mockPublicBootstrap(page)
  await page.route('**/v1/users/me/models**', (route) => route.fulfill({
    json: [{ key: 'qa-image', displayName: 'QA Image', upstreamModel: 'qa-image', capability: 'IMAGE', enabled: true, isDefault: true, flatCreditCost: 1 }],
  }))
  await page.route('**/v1/inspirations?**', (route) => route.fulfill({ json: [] }))

  await page.goto('/image')
  await expect(page.getByText('暂无可用灵感', { exact: true })).toBeVisible()
  await expect(page.locator('.inspiration-loading')).toHaveCount(0)
  await expect(page.locator('.inspiration-error')).toHaveCount(0)
})

test('共享对话断网时显示可理解的错误并支持重试', async ({ page }) => {
  await mockPublicBootstrap(page)
  let shareRequests = 0
  await page.route('**/v1/shares/qa-share', async (route) => {
    shareRequests += 1
    if (shareRequests === 1) {
      await route.abort('failed')
      return
    }
    const now = new Date().toISOString()
    await route.fulfill({
      json: {
        title: '恢复后的共享对话',
        model: 'QA Model',
        createdAt: now,
        sharedAt: now,
        messages: [
          { id: 'message-user', role: 'USER', content: '测试问题', createdAt: now },
          { id: 'message-assistant', role: 'ASSISTANT', content: '测试回答', createdAt: now },
        ],
      },
    })
  })

  await page.goto('/share/qa-share')
  await expect(page.getByRole('heading', { name: '无法打开此共享对话' })).toBeVisible()
  await expect(page.getByText('网络连接失败，请检查网络后重试。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByRole('heading', { name: '恢复后的共享对话' })).toBeVisible()
  await expect(page.getByText('测试回答', { exact: true })).toBeVisible()
})

test('移动端画布释放桌面侧栏占位并保持 Agent 面板内的可视区域', async ({ page }) => {
  await mockPublicBootstrap(page)
  const now = new Date().toISOString()
  const canvas = {
    id: 'qa-mobile-canvas',
    userId: 'qa-user',
    projectId: null,
    title: '移动端画布验收',
    kind: 'FREEFORM',
    revision: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    accessRole: 'OWNER',
    document: { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'lines', nodes: [], edges: [] },
  }
  await page.route('**/v1/canvases/qa-mobile-canvas', (route) => route.fulfill({ json: canvas }))
  await page.route('**/v1/users/me/models**', (route) => route.fulfill({ json: [] }))
  await page.route('**/v1/inspirations?mode=IMAGE_TOOL', (route) => route.fulfill({ json: [] }))
  await page.route('**/v1/notifications', (route) => route.fulfill({ json: [] }))
  await page.route('**/v1/agent-tasks', (route) => route.fulfill({ json: [] }))

  await page.goto('/canvas/qa-mobile-canvas')
  const agentPanel = page.getByRole('complementary', { name: 'Canvas Agent 对话面板' })
  await expect(agentPanel).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(agentPanel).toHaveCount(0)
  await assertNoPageOverflow(page)

  const compactLayout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.canvas-editor-header')!.getBoundingClientRect()
    const flow = document.querySelector<HTMLElement>('.canvas-flow')!.getBoundingClientRect()
    return { header: { left: header.left, right: header.right, top: header.top, width: header.width }, flowBottom: flow.bottom, viewportHeight: innerHeight, viewportWidth: innerWidth }
  })
  expect(compactLayout.header.left).toBeGreaterThanOrEqual(0)
  expect(compactLayout.header.top).toBe(0)
  expect(compactLayout.header.width).toBeGreaterThan(320)
  expect(compactLayout.header.right).toBeLessThanOrEqual(compactLayout.viewportWidth + 1)
  expect(compactLayout.flowBottom).toBeLessThanOrEqual(compactLayout.viewportHeight + 1)

  await page.getByRole('button', { name: '画布 Agent' }).click()
  await expect(agentPanel).toBeVisible()
  const openLayout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.canvas-editor-header')!.getBoundingClientRect()
    const flow = document.querySelector<HTMLElement>('.canvas-flow')!.getBoundingClientRect()
    const sidebar = document.querySelector<HTMLElement>('.canvas-workspace-sidebar')!.getBoundingClientRect()
    return { headerRight: header.right, flowBottom: flow.bottom, sidebarTop: sidebar.top, viewportWidth: innerWidth }
  })
  expect(openLayout.headerRight).toBeLessThanOrEqual(openLayout.viewportWidth + 1)
  expect(Math.abs(openLayout.flowBottom - openLayout.sidebarTop)).toBeLessThanOrEqual(2)

  await page.reload()
  await expect(page.locator('.canvas-editor-page')).toBeVisible()
  await expect(agentPanel).toHaveCount(0)

  for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 414, height: 896 }]) {
    await page.setViewportSize(viewport)
    const layout = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.canvas-editor-header')!.getBoundingClientRect()
      const flow = document.querySelector<HTMLElement>('.canvas-flow')!.getBoundingClientRect()
      return { headerLeft: header.left, headerRight: header.right, flowBottom: flow.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight }
    })
    expect(layout.headerLeft).toBeGreaterThanOrEqual(0)
    expect(layout.headerRight).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.flowBottom).toBeLessThanOrEqual(layout.viewportHeight + 1)
    await assertNoPageOverflow(page)
  }
})
