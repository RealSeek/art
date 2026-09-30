import { onMounted, onUnmounted } from 'vue'

const VISIBLE_REFRESH_INTERVAL_MS = 60_000
const MIN_REFRESH_GAP_MS = 15_000

/**
 * 模型目录自动刷新节奏：标签页可见时按分钟轮询，窗口重新聚焦或标签页切回时立即补刷。
 * 管理员在后台改动模型后，用户端无需手动重开选择器或刷新页面。
 */
export function useModelCatalogRefresh(refresh: () => void, options: { minGapMs?: number } = {}) {
  const minGapMs = options.minGapMs ?? MIN_REFRESH_GAP_MS
  let lastRefreshedAt = Date.now()
  let timer = 0

  function refreshNow() {
    if (Date.now() - lastRefreshedAt < minGapMs) return
    lastRefreshedAt = Date.now()
    refresh()
  }

  function refreshWhenVisible() {
    if (!document.hidden) refreshNow()
  }

  onMounted(() => {
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    timer = window.setInterval(refreshWhenVisible, VISIBLE_REFRESH_INTERVAL_MS)
  })
  onUnmounted(() => {
    window.clearInterval(timer)
    window.removeEventListener('focus', refreshWhenVisible)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
  })

  return { refreshNow }
}
