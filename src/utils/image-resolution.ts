export type ImageResolutionTier = '1K' | '2K' | '4K'

const TIER_ORDER: ImageResolutionTier[] = ['1K', '2K', '4K']

/** 参考图比例对应的常用输出尺寸（每档一条，与上游文档尺寸表一致）。 */
const REFERENCE_SIZE_TABLE: Record<string, Record<ImageResolutionTier, string>> = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880' },
  '3:2': { '1K': '1536x1024', '2K': '2016x1344', '4K': '3520x2352' },
  '2:3': { '1K': '1024x1536', '2K': '1344x2016', '4K': '2352x3520' },
  '16:9': { '1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160' },
  '9:16': { '1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840' },
  '4:3': { '1K': '1152x864', '2K': '2016x1512', '4K': '3200x2400' },
  '3:4': { '1K': '864x1152', '2K': '1512x2016', '4K': '2400x3200' },
}

/**
 * 分辨率档位按总像素划分，与后端 generations/image-options.ts 的 imageResolutionTier 保持一致
 * （1K ≤ 2M 像素、2K ≤ 6M、其余 4K；tests/unit/image-resolution.test.ts 校验）。
 */
export function imageResolutionTier(size: string): ImageResolutionTier {
  const [width, height] = size.toLowerCase().split('x').map(Number)
  const pixels = (width || 0) * (height || 0)
  return pixels > 6_000_000 ? '4K' : pixels > 2_000_000 ? '2K' : '1K'
}

/**
 * 参考图编辑时的输出尺寸：跟随参考图宽高比（输出比例由上游 size 决定），
 * 档位仍由用户选择；比例接近标准比例时直接用上游尺寸表里的常用尺寸，
 * 否则按上游限制（边长 256–3840、16 的倍数、65.5万–829万像素）换算。
 */
export function imageSizeForReferenceRatio(ratio: number, tier: ImageResolutionTier): string | null {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 3 || ratio < 1 / 3) return null
  const standard = Object.entries(REFERENCE_SIZE_TABLE).find(([key]) => {
    const [width, height] = key.split(':').map(Number)
    return Math.abs(width / height - ratio) / ratio <= 0.04
  })
  if (standard) return standard[1][tier]
  const base = tier === '4K' ? 2880 : tier === '2K' ? 2048 : 1280
  let width = ratio >= 1 ? base : Math.round(base * ratio)
  let height = ratio >= 1 ? Math.round(base / ratio) : base
  const pixels = width * height
  if (pixels < 655_360 || pixels > 8_294_400) {
    const scale = Math.sqrt((pixels < 655_360 ? 655_360 : 8_294_400) / pixels)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  width = Math.round(width / 16) * 16
  height = Math.round(height / 16) * 16
  if (Math.min(width, height) < 256 || Math.max(width, height) > 3840) return null
  if (width * height < 655_360 || width * height > 8_294_400) return null
  if (Math.max(width, height) / Math.min(width, height) > 3) return null
  return `${width}x${height}`
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
