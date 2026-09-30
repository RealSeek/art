export type ImageResolutionTier = '1K' | '2K' | '4K'

const TIER_ORDER: ImageResolutionTier[] = ['1K', '2K', '4K']

/** 与后端 generations/image-options.ts 的 imageResolutionTier 保持一致（tests/unit/image-resolution.test.ts 校验）。 */
export function imageResolutionTier(size: string): ImageResolutionTier {
  const [width, height] = size.toLowerCase().split('x').map(Number)
  const edge = Math.max(width || 0, height || 0)
  return edge >= 4096 ? '4K' : edge >= 2048 ? '2K' : '1K'
}

/** 模型支持的画质档位来自它的尺寸清单；清单里没有的档位不展示。 */
export function availableImageTiers(sizes: string[]): ImageResolutionTier[] {
  const tiers = new Set(sizes.map(imageResolutionTier))
  return TIER_ORDER.filter((tier) => tiers.has(tier))
}

function ratioValue(ratio: string) {
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return null
  return width / height
}

function closestSize(pool: string[], target: number) {
  return [...pool].sort((left, right) => {
    const [leftWidth, leftHeight] = left.split('x').map(Number)
    const [rightWidth, rightHeight] = right.split('x').map(Number)
    return Math.abs(leftWidth / leftHeight - target) - Math.abs(rightWidth / rightHeight - target)
  })[0] || ''
}

/**
 * 按比例与画质档位挑选实际尺寸：先限定在该档位内，再取宽高比最接近的一个；
 * 自动比例优先沿用模型默认尺寸，其次按默认尺寸的宽高比匹配。
 */
export function pickImageSize(sizes: string[], tier: ImageResolutionTier, ratio: string, fallback: string) {
  const candidates = sizes.filter((size) => imageResolutionTier(size) === tier)
  const pool = candidates.length ? candidates : sizes
  if (!pool.length) return fallback
  const target = ratioValue(ratio)
  if (target === null) {
    if (imageResolutionTier(fallback) === tier) return fallback
    return closestSize(pool, ratioValue(fallback) ?? 1) || fallback
  }
  return closestSize(pool, target) || fallback
}
