import { expect, test } from '@playwright/test'
import { assertNoPageOverflow } from './helpers'

test('canvas and image prompt have separate sidebar entries below creation', async ({ page }, testInfo) => {
  const now = new Date().toISOString()
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = []
    if (path === '/v1/auth/session') body = { user: null }
    else if (path === '/v1/auth/setup/status') body = { required: false }
    else if (path === '/v1/catalog/settings') body = {}
    else if (path === '/v1/canvases/capabilities') body = { canvasAccess: true, shortDramaAccess: true, maxCanvases: 100, maxCanvasNodes: 500, usedCanvases: 1 }
    else if (path === '/v1/canvases') body = [{ id: 'nav-canvas', title: 'Navigation canvas', kind: 'FREEFORM', nodeCount: 0, revision: 1, updatedAt: now, accessRole: 'OWNER' }]
    else if (path === '/v1/canvases/nav-canvas') body = { id: 'nav-canvas', userId: 'nav-user', title: 'Navigation canvas', kind: 'FREEFORM', revision: 1, createdAt: now, updatedAt: now, accessRole: 'OWNER', document: { version: 1, viewport: { x: 0, y: 0, zoom: 1 }, background: 'dots', nodes: [], edges: [] } }
    await route.fulfill({ json: body })
  })

  await page.goto('/workspace')
  const menu = page.getByRole('navigation', { name: '工作台导航' })
  const tabs = page.getByRole('navigation', { name: '工作空间内容' })
  await expect(menu.getByRole('link')).toHaveText(['新对话', 'AI 创作', '画布', '图片反推', '电商中心', '办公中心', '提示词库', '能力中心', '工作空间'])
  await expect(tabs.getByRole('link')).toHaveText(['项目', '文件'])
  await tabs.getByRole('link', { name: '文件', exact: true }).click()
  await expect(page.getByRole('heading', { name: '文件库', exact: true })).toBeVisible()
  await expect(tabs.getByRole('link', { name: '文件', exact: true })).toHaveClass(/is-active/)
  await expect(menu.locator('.is-active')).toHaveText('工作空间')

  await menu.getByRole('link', { name: '画布', exact: true }).click()
  await expect(page.getByRole('heading', { name: '画布', exact: true })).toBeVisible()
  await expect(menu.locator('.is-active')).toHaveText('画布')
  await expect(tabs).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('canvas-navigation-desktop.png') })
  await page.getByRole('button', { name: '打开Navigation canvas', exact: true }).click()
  await expect(page).toHaveURL(/\/canvas\/nav-canvas$/)
  await page.goto('/image-prompt')
  await expect(page.getByRole('heading', { name: '图片反推', exact: true })).toBeVisible()
  await expect(menu.locator('.is-active')).toHaveText('图片反推')
  await expect(tabs).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.workspace-mobile-title')).toHaveText('图片反推')
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await assertNoPageOverflow(page)
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  await expect(menu.getByRole('link', { name: '画布', exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().left)).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('creation-navigation-mobile.png') })
  await menu.getByRole('link', { name: '画布', exact: true }).click()
  await expect(page.locator('.workspace-mobile-title')).toHaveText('画布')
  await expect(page.locator('.workspace-sidebar')).not.toHaveClass(/is-mobile-open/)
  await expect(page.getByRole('heading', { name: '画布', exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.workspace-sidebar').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0)
  await assertNoPageOverflow(page)
})
