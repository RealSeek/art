export const VIDEO_DURATION_PRESETS = [5, 10, 15]
export const MIN_VIDEO_DURATION_SECONDS = 1
export const MAX_VIDEO_DURATION_SECONDS = 15

/** 时长档位 = 模型声明时长 ∪ 固定档位（5/10/15），统一按 1–15 秒截断。 */
export function videoDurationOptions(declared: number[]) {
  const values = new Set([...declared.map((item) => Math.round(item)), ...VIDEO_DURATION_PRESETS])
  return [...values]
    .filter((item) => Number.isInteger(item) && item >= MIN_VIDEO_DURATION_SECONDS && item <= MAX_VIDEO_DURATION_SECONDS)
    .sort((left, right) => left - right)
}

/** 自定义秒数只保留 1–15 之间的整数；空值或非数字回退到当前时长。 */
export function clampVideoDuration(value: unknown, fallback: number) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return fallback
  const seconds = Math.round(Number(value))
  if (!Number.isFinite(seconds)) return fallback
  return Math.min(MAX_VIDEO_DURATION_SECONDS, Math.max(MIN_VIDEO_DURATION_SECONDS, seconds))
}
