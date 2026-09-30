const DEFAULT_MAX_EDGE = 2048
const DEFAULT_QUALITY = 0.9
/** 小于该体积的图片不再压缩，避免无意义的重编码。 */
const DEFAULT_SKIP_UNDER_BYTES = 1.5 * 1024 * 1024

/**
 * 上传前的参考图压缩：在浏览器内降采样到 2048 长边并转为 WebP（保留透明通道）。
 * 设计稿导出的 5 MB PNG 通常能降到几百 KB，上传耗时和服务端处理都明显下降；
 * 已在阈值内或浏览器无法处理时原样返回。蒙版不做压缩（尺寸与像素必须精确）。
 */
export async function compressImageForUpload(file: File, options: { maxEdge?: number; quality?: number; skipUnderBytes?: number } = {}) {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE
  const quality = options.quality ?? DEFAULT_QUALITY
  const skipUnder = options.skipUnderBytes ?? DEFAULT_SKIP_UNDER_BYTES
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  if (file.size <= skipUnder) return file
  try {
    const bitmap = await createImageBitmap(file)
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, maxEdge / Math.max(1, longEdge))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) { bitmap.close(); return file }
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.includes('.') ? `${file.name.slice(0, file.name.lastIndexOf('.'))}.webp` : `${file.name}.webp`
    return new File([blob], name, { type: 'image/webp' })
  } catch {
    return file
  }
}
