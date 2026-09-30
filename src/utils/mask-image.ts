import type { CatalogModel } from './model-catalog'

export type MaskFormat = 'OPAQUE_WHITE' | 'ALPHA_TRANSPARENT'

/**
 * 蒙版编码由目标渠道决定：
 * - 本地 Worker（IOPaint 等）读取不透明灰度图，白色=编辑区域；
 * - OpenAI 兼容 /images/edits 用透明通道标记编辑区域，其余区域保持不透明。
 */
export function maskFormatForTarget(model?: CatalogModel | null, options: { worker?: boolean } = {}): MaskFormat {
  if (options.worker || model?.provider?.type === 'LOCAL_WORKER') return 'OPAQUE_WHITE'
  return 'ALPHA_TRANSPARENT'
}

/** Gemini 原生生图不接收蒙版参数，本地 Worker 与声明支持蒙版的图片模型才提供区域编辑。 */
export function regionEditAvailable(model?: CatalogModel | null, options: { worker?: boolean } = {}) {
  if (options.worker || model?.provider?.type === 'LOCAL_WORKER') return true
  if (!model || model.capability !== 'IMAGE' || model.apiProtocol === 'gemini') return false
  return model.options?.imageCapabilities?.supportsMask === true
}

/**
 * 把画布选区（RGBA，alpha 表示选中程度）转换为渠道需要的蒙版像素。
 * 羽化边缘保留为灰度或半透明，交给上游自行平滑过渡。
 */
export function writeMaskPixels(rgba: Uint8ClampedArray, format: MaskFormat): Uint8ClampedArray {
  const output = new Uint8ClampedArray(rgba.length)
  for (let index = 0; index < rgba.length; index += 4) {
    const selection = rgba[index + 3]
    if (format === 'OPAQUE_WHITE') {
      output[index] = selection
      output[index + 1] = selection
      output[index + 2] = selection
      output[index + 3] = 255
      continue
    }
    output[index + 3] = 255 - selection
  }
  return output
}
