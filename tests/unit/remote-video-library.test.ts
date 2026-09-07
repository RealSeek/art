import assert from 'node:assert/strict'
import test from 'node:test'
import { collectYouMindPromptUrls } from '../../server/src/prompt-templates/remote-video-library'

test('YouMind sitemap collection filters, deduplicates, prefers zh-CN, and caps results', async () => {
  async function* sitemaps() {
    yield `
      <urlset>
        <url><loc>https://youmind.com/video-prompts/first-scene-1</loc></url>
        <url><loc>https://youmind.com/prompts/image-scene-9</loc></url>
        <url><loc>https://youmind.com/video-prompts/second-scene-2</loc></url>
      </urlset>
    `
    yield `
      <urlset>
        <url><loc>https://youmind.com/zh-CN/video-prompts/first-scene-1</loc></url>
        <url><loc>https://youmind.com/video-prompts/third-scene-3</loc></url>
      </urlset>
    `
  }

  assert.deepEqual(await collectYouMindPromptUrls('video', sitemaps(), 2), [
    'https://youmind.com/zh-CN/video-prompts/first-scene-1',
    'https://youmind.com/video-prompts/second-scene-2',
  ])
})
