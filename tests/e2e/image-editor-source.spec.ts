import { expect, test } from '@playwright/test'

test('media URLs remain unchanged while API paths use the API base', async ({ page }) => {
  await page.goto('/')
  const urls = await page.evaluate(async () => {
    const modulePath = '/src/services/api.ts'
    const { apiUrl } = await import(modulePath)
    const sources = [
      'blob:https://art.realseek.wiki/local-image',
      'data:image/png;base64,aGVsbG8=',
      'https://example.com/image.png',
      'http://localhost/image.png',
    ]
    return {
      sources,
      resolved: sources.map((source) => apiUrl(source)),
      asset: apiUrl('/v1/assets/image/content'),
      relative: apiUrl('/assets/image/content'),
    }
  })
  expect(urls.resolved).toEqual(urls.sources)
  expect(urls.asset).toMatch(/\/v1\/assets\/image\/content$/)
  expect(urls.relative).toBe(urls.asset)
})

for (const editor of ['RegionEditorDialog', 'CanvasImageEditorDialog']) {
  test(`${editor} reads a local Blob image`, async ({ page }) => {
    const malformedRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/v1/blob:')) malformedRequests.push(request.url())
    })
    await page.goto('/')
    await page.evaluate(async (editorName) => {
      const vuePath = '/node_modules/.vite/deps/vue.js'
      const componentPath = `/src/components/${editorName}.vue`
      const { createApp } = await import(vuePath)
      const { default: component } = await import(componentPath)
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 100
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ef4444'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result!), 'image/png'))
      const src = URL.createObjectURL(blob)
      const host = document.createElement('div')
      document.body.append(host)
      const app = createApp(component, { src, maskFormat: 'ALPHA_TRANSPARENT' })
      app.mount(host)
      window.addEventListener('pagehide', () => {
        app.unmount()
        URL.revokeObjectURL(src)
      }, { once: true })
    }, editor)

    const image = page.getByAltText('待编辑图片')
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(160)
    await expect(page.getByText(/原图读取失败|当前文件不是可编辑图片/)).toHaveCount(0)
    expect(malformedRequests).toEqual([])
  })
}
