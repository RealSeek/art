import { BadRequestException } from '@nestjs/common'

export type NormalizedVideoOptions = {
  resolution: string
  duration: number
  aspectRatio: string
  referenceAssetIds: string[]
  audioAssetIds: string[]
  /** 浏览器本地素材；仅要求公网 URL 的模型会在任务期间临时托管。 */
  referenceImages: Array<{ name: string; mimeType: string; dataUrl: string }>
  referenceAudios: Array<{ name: string; mimeType: string; dataUrl: string }>
  referenceImageUrls: string[]
  referenceAudioUrls: string[]
  referenceVideoUrls: string[]
  imageRole: 'reference_image' | 'first_frame' | 'last_frame' | 'first_last_frame'
  faceRequired?: boolean
  generateAudio?: boolean
  watermark?: boolean
  returnLastFrame?: boolean
  videoTaskType?: 'auto' | 'reference' | 'edit' | 'extend'
  videoFormat?: 'mp4' | 'mov'
}

/**
 * 参考素材传输方式：
 * - INPUT_REFERENCE：multipart 的 input_reference 字段，单张参考图（旧行为）；
 * - DATA_URL_JSON：JSON 的 images/audios 数组，使用 base64 Data URL。
 * - CONTENT_JSON：原生 content 数组，明确指定媒体类型和角色。
 */
export type VideoReferenceMode = 'INPUT_REFERENCE' | 'DATA_URL_JSON' | 'CONTENT_JSON'

export function isNativeVideoReferenceMode(mode: VideoReferenceMode) {
  return mode === 'CONTENT_JSON'
}

export type VideoCapabilityConfig = {
  resolutions: string[]
  durations: number[]
  aspectRatios: string[]
  defaultResolution: string
  defaultDuration: number
  defaultAspectRatio: string
  pricing: Record<string, number>
  createPath: string
  statusPath: string
  contentPath: string
  pollIntervalMs: number
  maxPollSeconds: number
  maxReferences: number
  maxAudioReferences: number
  maxVideoReferences: number
  maxFirstLastFrames: number
  maxTotalReferences: number
  faceSupported: boolean | null
  requiresPublicReferenceUrls: boolean
  supportsAutoDuration: boolean
  audioRequiresVisualReference: boolean
  supportsVideoEditing: boolean
  requestFormat: 'seedance' | 'minimax-h3' | null
  referenceMode: VideoReferenceMode
  minDuration: number
  maxDuration: number
  /** 分辨率由模型名绑定（如 MiniMax H3 变体），请求时不再发送 resolution。 */
  resolutionLocked: boolean
}

export const MIN_VIDEO_DURATION_SECONDS = 1
export const MAX_VIDEO_DURATION_SECONDS = 15
/** 参考素材单文件上限（与上游文档一致：图片 30 MB、音频 15 MB）。 */
export const MAX_VIDEO_REFERENCE_BYTES = 30 * 1024 * 1024
export const MAX_VIDEO_AUDIO_BYTES = 15 * 1024 * 1024

const DEFAULTS: VideoCapabilityConfig = {
  resolutions: ['720p', '1080p'],
  durations: [5, 10],
  aspectRatios: ['16:9', '9:16', '1:1'],
  defaultResolution: '720p',
  defaultDuration: 5,
  defaultAspectRatio: '16:9',
  pricing: {},
  createPath: '/videos',
  statusPath: '/videos/{id}',
  contentPath: '/videos/{id}/content',
  pollIntervalMs: 3000,
  maxPollSeconds: 0,
  maxReferences: 1,
  maxAudioReferences: 0,
  maxVideoReferences: 0,
  maxFirstLastFrames: 0,
  maxTotalReferences: 0,
  faceSupported: null,
  requiresPublicReferenceUrls: false,
  supportsAutoDuration: false,
  audioRequiresVisualReference: true,
  supportsVideoEditing: false,
  requestFormat: null,
  referenceMode: 'INPUT_REFERENCE',
  minDuration: MIN_VIDEO_DURATION_SECONDS,
  maxDuration: MAX_VIDEO_DURATION_SECONDS,
  resolutionLocked: false,
}

/** Capability defaults for the official Seedance content[] request format. */
export function seedanceChannelCapabilities(model: string) {
  const version = /seedance[-_ ]?2[-_.]?([05])(?:\D|$)/i.exec(model)?.[1]
  if (!version) return undefined
  const v25 = version === '5'
  const compact = /(?:fast|mini)/i.test(model)
  return {
    requestFormat: 'seedance' as const,
    resolutions: v25 ? ['480p', '720p', '1080p'] : compact ? ['480p', '720p'] : ['480p', '720p', '1080p', '4k'],
    durations: v25 ? [5, 10, 15, 20, 25, 30] : [4, 5, 10, 15],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    defaultResolution: '720p', defaultDuration: 5, defaultAspectRatio: '16:9',
    minDuration: 4, maxDuration: v25 ? 30 : 15,
    maxReferences: v25 ? 30 : 9, maxAudioReferences: v25 ? 10 : 3, maxVideoReferences: v25 ? 10 : 3,
    maxFirstLastFrames: 2, maxTotalReferences: v25 ? 50 : 15, faceSupported: null, requiresPublicReferenceUrls: false,
    referenceMode: 'CONTENT_JSON' as const, supportsAutoDuration: true,
    audioRequiresVisualReference: !v25, supportsVideoEditing: v25,
    createPath: '/videos', statusPath: '/videos/{id}', contentPath: '/videos/{id}/content',
    pollIntervalMs: 5000, maxPollSeconds: 0,
  }
}

/** Official Seedance content[] request capabilities for user-managed channels. */
export function seedanceVideoCapabilities(model: string) {
  return seedanceChannelCapabilities(model)
}

function safePath(value: unknown, fallback: string) {
  const path = String(value || fallback).trim()
  return /^\/[a-zA-Z0-9_{}./-]+$/.test(path) ? path : fallback
}

function pricingMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, number> = {}
  for (const [key, price] of Object.entries(value as Record<string, unknown>)) {
    const credits = Number(price)
    if (/^[a-zA-Z0-9_-]{1,30}:\d{1,4}$/.test(key) && Number.isInteger(credits) && credits >= 0 && credits <= 100000) result[key] = credits
  }
  return result
}

export function videoCapabilities(value: unknown): VideoCapabilityConfig {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const raw = root.videoCapabilities && typeof root.videoCapabilities === 'object' && !Array.isArray(root.videoCapabilities) ? root.videoCapabilities as Record<string, unknown> : root
  const resolutions = Array.isArray(raw.resolutions) ? [...new Set(raw.resolutions.map(String).map((item) => item.trim().toLowerCase()).filter((item) => /^(\d{3,4}p|2k|4k)$/.test(item)))].slice(0, 10) : DEFAULTS.resolutions
  const durations = Array.isArray(raw.durations) ? [...new Set(raw.durations.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 300))].sort((a, b) => a - b).slice(0, 20) : DEFAULTS.durations
  const aspectRatios = Array.isArray(raw.aspectRatios) ? [...new Set(raw.aspectRatios.map(String).filter((item) => /^(\d{1,2}:\d{1,2}|adaptive)$/.test(item)))].slice(0, 10) : DEFAULTS.aspectRatios
  const safeResolutions = resolutions.length ? resolutions : DEFAULTS.resolutions
  const safeDurations = durations.length ? durations : DEFAULTS.durations
  const safeRatios = aspectRatios.length ? aspectRatios : DEFAULTS.aspectRatios
  const defaultResolution = safeResolutions.includes(String(raw.defaultResolution).toLowerCase()) ? String(raw.defaultResolution).toLowerCase() : safeResolutions[0]
  const requestedDuration = Number(raw.defaultDuration)
  const defaultDuration = safeDurations.includes(requestedDuration) ? requestedDuration : safeDurations[0]
  const defaultAspectRatio = safeRatios.includes(String(raw.defaultAspectRatio)) ? String(raw.defaultAspectRatio) : safeRatios[0]
  return {
    resolutions: safeResolutions,
    durations: safeDurations,
    aspectRatios: safeRatios,
    defaultResolution,
    defaultDuration,
    defaultAspectRatio,
    pricing: pricingMap(raw.pricing),
    createPath: safePath(raw.createPath, DEFAULTS.createPath),
    statusPath: safePath(raw.statusPath, DEFAULTS.statusPath),
    contentPath: safePath(raw.contentPath, DEFAULTS.contentPath),
    pollIntervalMs: Math.max(500, Math.min(30000, Number(raw.pollIntervalMs) || DEFAULTS.pollIntervalMs)),
    maxPollSeconds: Math.max(0, Math.min(7200, Number.isFinite(Number(raw.maxPollSeconds)) ? Number(raw.maxPollSeconds) : DEFAULTS.maxPollSeconds)),
    maxReferences: Math.max(0, Math.min(30, Number.isInteger(Number(raw.maxReferences)) ? Number(raw.maxReferences) : DEFAULTS.maxReferences)),
    maxAudioReferences: Math.max(0, Math.min(10, Number.isInteger(Number(raw.maxAudioReferences)) ? Number(raw.maxAudioReferences) : DEFAULTS.maxAudioReferences)),
    maxVideoReferences: Math.max(0, Math.min(10, Number.isInteger(Number(raw.maxVideoReferences)) ? Number(raw.maxVideoReferences) : DEFAULTS.maxVideoReferences)),
    maxFirstLastFrames: Math.max(0, Math.min(2, Number.isInteger(Number(raw.maxFirstLastFrames)) ? Number(raw.maxFirstLastFrames) : DEFAULTS.maxFirstLastFrames)),
    maxTotalReferences: Math.max(0, Math.min(50, Number.isInteger(Number(raw.maxTotalReferences)) ? Number(raw.maxTotalReferences) : DEFAULTS.maxTotalReferences)),
    faceSupported: typeof raw.faceSupported === 'boolean' ? raw.faceSupported : DEFAULTS.faceSupported,
    requiresPublicReferenceUrls: raw.requiresPublicReferenceUrls === true,
    supportsAutoDuration: raw.supportsAutoDuration === true,
    audioRequiresVisualReference: raw.audioRequiresVisualReference !== false,
    supportsVideoEditing: raw.supportsVideoEditing === true,
    requestFormat: raw.requestFormat === 'seedance' || raw.requestFormat === 'minimax-h3' ? raw.requestFormat : null,
    referenceMode: raw.referenceMode === 'CONTENT_JSON' || raw.referenceMode === 'DATA_URL_JSON' ? raw.referenceMode : DEFAULTS.referenceMode,
    minDuration: Math.max(MIN_VIDEO_DURATION_SECONDS, Math.min(300, Number.isInteger(Number(raw.minDuration)) ? Number(raw.minDuration) : DEFAULTS.minDuration)),
    maxDuration: Math.max(MIN_VIDEO_DURATION_SECONDS, Math.min(300, Number.isInteger(Number(raw.maxDuration)) ? Number(raw.maxDuration) : DEFAULTS.maxDuration)),
    resolutionLocked: raw.resolutionLocked === true,
  }
}

export function normalizeVideoOptions(options: Record<string, unknown>, configuredCapabilities?: unknown): NormalizedVideoOptions {
  const capabilities = videoCapabilities(configuredCapabilities)
  const resolution = String(options.resolution || capabilities.defaultResolution).toLowerCase()
  const duration = Math.round(Number(options.duration || capabilities.defaultDuration))
  const aspectRatio = String(options.aspectRatio || capabilities.defaultAspectRatio)
  const referenceAssetIds = assetIds(options.referenceAssetIds)
  const audioAssetIds = assetIds(options.audioAssetIds)
  const referenceImages = inlineMediaList(options.referenceImages, 'image')
  const referenceAudios = inlineMediaList(options.referenceAudios, 'audio')
  const referenceImageUrls = publicHttpsUrls(options.referenceImageUrls, '参考图')
  const referenceAudioUrls = publicHttpsUrls(options.referenceAudioUrls, '参考音频')
  const referenceVideoUrls = publicHttpsUrls(options.referenceVideoUrls, '参考视频')
  const referenceCount = referenceAssetIds.length + referenceImages.length + referenceImageUrls.length
  const audioCount = audioAssetIds.length + referenceAudios.length + referenceAudioUrls.length
  const imageRole = options.imageRole === 'first_frame' || options.imageRole === 'last_frame' || options.imageRole === 'first_last_frame' ? options.imageRole : 'reference_image'
  const frameCount = imageRole === 'first_last_frame' ? 2 : imageRole === 'reference_image' ? 0 : 1
  if (!capabilities.resolutions.includes(resolution)) throw new BadRequestException('当前视频模型不支持该分辨率')
  if (!(duration === -1 && capabilities.supportsAutoDuration) && (!Number.isInteger(duration) || duration < capabilities.minDuration || duration > capabilities.maxDuration)) {
    throw new BadRequestException(`video.duration must be between ${capabilities.minDuration} and ${capabilities.maxDuration} seconds`)
  }
  if (!capabilities.aspectRatios.includes(aspectRatio)) throw new BadRequestException('当前视频模型不支持该画面比例')
  if (capabilities.requestFormat && options.returnLastFrame === true) {
    throw new BadRequestException('当前官方 Seedance/MiniMax 请求格式不支持 returnLastFrame')
  }
  if (capabilities.requestFormat === 'minimax-h3' && (options.generateAudio !== undefined || options.watermark !== undefined || options.videoFormat !== undefined || options.videoTaskType !== undefined)) {
    throw new BadRequestException('MiniMax H3 官方视频请求不接受 generateAudio、watermark 或 videoFormat 参数')
  }
  if (imageRole === 'reference_image' && referenceCount > capabilities.maxReferences) {
    throw new BadRequestException(capabilities.maxReferences
      ? `当前视频模型最多支持 ${capabilities.maxReferences} 张参考图`
      : '当前视频模型不支持参考图')
  }
  if (audioCount > capabilities.maxAudioReferences) {
    throw new BadRequestException(capabilities.maxAudioReferences
      ? `当前视频模型最多支持 ${capabilities.maxAudioReferences} 段参考音频`
      : '当前视频模型不支持参考音频')
  }
  if (referenceVideoUrls.length > capabilities.maxVideoReferences) throw new BadRequestException(`当前视频模型最多支持 ${capabilities.maxVideoReferences} 段参考视频`)
  if (capabilities.maxTotalReferences && referenceCount + audioCount + referenceVideoUrls.length > capabilities.maxTotalReferences) throw new BadRequestException(`当前视频模型最多支持 ${capabilities.maxTotalReferences} 个参考素材`)
  if (audioCount && capabilities.audioRequiresVisualReference && !referenceCount && !referenceVideoUrls.length) throw new BadRequestException('参考音频必须搭配至少一张参考图或参考视频')
  if (frameCount > capabilities.maxFirstLastFrames) throw new BadRequestException('当前视频模型不支持所选首尾帧模式')
  if (imageRole !== 'reference_image' && (referenceCount !== frameCount || audioCount || referenceVideoUrls.length)) throw new BadRequestException('首帧或尾帧需要一张图片，首尾帧需要两张图片，且不能混用参考音频或视频')
  if (options.faceRequired === true && capabilities.faceSupported !== true) throw new BadRequestException('当前渠道未声明人脸参考支持')
  const videoTaskType = options.videoTaskType as NormalizedVideoOptions['videoTaskType']
  if (videoTaskType !== undefined && !['auto', 'reference', 'edit', 'extend'].includes(videoTaskType)) throw new BadRequestException('视频生成模式无效')
  if (videoTaskType && !capabilities.supportsVideoEditing) throw new BadRequestException('当前模型不支持视频编辑模式')
  if ((videoTaskType === 'edit' || videoTaskType === 'extend') && (!referenceVideoUrls.length || aspectRatio !== 'adaptive' || (videoTaskType === 'edit' && duration !== -1))) throw new BadRequestException('编辑和延长需要参考视频及 adaptive 比例；编辑需要自动时长')
  if (capabilities.supportsVideoEditing && imageRole !== 'reference_image' && aspectRatio !== 'adaptive') throw new BadRequestException('当前模型的首帧和首尾帧需要 adaptive 比例')
  const videoFormat = options.videoFormat as NormalizedVideoOptions['videoFormat']
  if (videoFormat !== undefined && (!capabilities.supportsVideoEditing || !['mp4', 'mov'].includes(videoFormat))) throw new BadRequestException('当前模型不支持该视频格式')
  return { resolution, duration, aspectRatio, referenceAssetIds, audioAssetIds, referenceImages, referenceAudios, referenceImageUrls, referenceAudioUrls, referenceVideoUrls, imageRole,
    ...(options.faceRequired === true ? { faceRequired: true } : {}),
    ...(typeof options.generateAudio === 'boolean' ? { generateAudio: options.generateAudio } : {}),
    ...(typeof options.watermark === 'boolean' ? { watermark: options.watermark } : {}),
    ...(typeof options.returnLastFrame === 'boolean' ? { returnLastFrame: options.returnLastFrame } : {}),
    ...(videoTaskType ? { videoTaskType } : {}), ...(videoFormat ? { videoFormat } : {}),
  }
}

/** 内联参考素材：只接受对应类型的 Data URL。 */
function inlineMediaList(value: unknown, kind: 'image' | 'audio') {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    const dataUrl = typeof row.dataUrl === 'string' ? row.dataUrl : ''
    if (!new RegExp(`^data:${kind}/`, 'i').test(dataUrl)) return []
    return [{ name: typeof row.name === 'string' ? row.name : `${kind}.bin`, mimeType: typeof row.mimeType === 'string' ? row.mimeType : dataUrl.slice(5, dataUrl.indexOf(';')), dataUrl }]
  })
}

function assetIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).filter((item) => /^[A-Za-z0-9_-]{1,100}$/.test(item)))]
    : []
}

function publicHttpsUrls(value: unknown, label: string) {
  if (!Array.isArray(value)) return []
  return value.map(String).map((item) => item.trim()).filter(Boolean).map((source) => {
    let url: URL
    try { url = new URL(source) } catch { throw new BadRequestException(`${label}需要可访问的 HTTPS 地址`) }
    if (url.protocol !== 'https:') throw new BadRequestException(`${label}需要可访问的 HTTPS 地址`)
    return source
  })
}

export function videoCreditCost(options: NormalizedVideoOptions, configuredCapabilities: unknown, fallback: number) {
  const configured = videoCapabilities(configuredCapabilities).pricing[`${options.resolution}:${options.duration}`]
  if (configured !== undefined) return configured
  const resolutionMultiplier = options.resolution === '2160p' || options.resolution === '4k' ? 4 : options.resolution === '1080p' ? 2 : 1
  const duration = options.duration === -1 ? videoCapabilities(configuredCapabilities).maxDuration : options.duration
  return Math.max(0, fallback) * resolutionMultiplier * Math.max(1, Math.ceil(duration / 5))
}
