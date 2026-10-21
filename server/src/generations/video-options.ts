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
  referenceVideos: Array<{ name: string; mimeType: string; dataUrl: string }>
  referenceImageUrls: string[]
  referenceAudioUrls: string[]
  referenceVideoUrls: string[]
  imageRole: 'reference_image' | 'first_frame' | 'last_frame' | 'first_last_frame'
  faceRequired?: boolean
  generateAudio?: boolean
  watermark?: boolean
  returnLastFrame?: boolean
  priority?: number
  executionExpiresAfter?: number
  safetyIdentifier?: string
  tools?: Array<Record<string, unknown>>
  videoTaskType?: 'auto' | 'reference' | 'edit' | 'extend'
  videoFormat?: 'mp4' | 'mov'
}

/**
 * 参考素材传输方式：
 * - INPUT_REFERENCE：multipart 的 input_reference 字段，单张参考图（旧行为）；
 * - DATA_URL_JSON：JSON 的 images/audios 数组，使用 base64 Data URL。
 * - CONTENT_JSON：原生 content 数组，明确指定媒体类型和角色。
 */
export type VideoReferenceMode = 'INPUT_REFERENCE' | 'DATA_URL_JSON' | 'CONTENT_JSON' | 'WAN_JSON' | 'KLING_JSON'

export function isNativeVideoReferenceMode(mode: VideoReferenceMode) {
  return mode === 'CONTENT_JSON' || mode === 'WAN_JSON' || mode === 'KLING_JSON'
}

export function usesManagedVideoTasks(capabilities: VideoCapabilityConfig) {
  return capabilities.requestProtocol === 'openai_video' || isNativeVideoReferenceMode(capabilities.referenceMode)
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
  requestFormat: 'seedance' | 'minimax-h3' | 'wan' | 'kling' | null
  requestProtocol: 'openai_video' | null
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
  requestProtocol: null,
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
  const discounted = /^\[c\]/i.test(model.trim())
  const fixedDuration = /^\[c\]seedance[-_ ]?2[-_.]5$/i.test(model.trim())
  const compact = /(?:fast|mini)/i.test(model)
  return {
    requestFormat: 'seedance' as const,
    resolutions: discounted ? ['720p'] : v25 ? ['480p', '720p', '1080p'] : compact ? ['480p', '720p'] : ['480p', '720p', '1080p', '4k'],
    durations: fixedDuration ? [30] : Array.from({ length: (v25 ? 30 : 15) - 4 + 1 }, (_, index) => index + 4),
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    defaultResolution: '720p', defaultDuration: fixedDuration ? 30 : 5, defaultAspectRatio: '16:9',
    minDuration: fixedDuration ? 30 : 4, maxDuration: v25 ? 30 : 15,
    maxReferences: v25 ? 30 : 9, maxAudioReferences: v25 ? 10 : 3, maxVideoReferences: v25 ? 10 : 3,
    maxFirstLastFrames: 2, maxTotalReferences: v25 ? 50 : 15, faceSupported: null, requiresPublicReferenceUrls: false,
    referenceMode: 'CONTENT_JSON' as const, supportsAutoDuration: !fixedDuration,
    audioRequiresVisualReference: !v25, supportsVideoEditing: v25,
    createPath: '/videos', statusPath: '/videos/{id}', contentPath: '/videos/{id}/content',
    pollIntervalMs: 5000, maxPollSeconds: 0,
  }
}

/** Official Seedance content[] request capabilities for user-managed channels. */
export function seedanceVideoCapabilities(model: string) {
  return seedanceChannelCapabilities(model)
}

type WanKind = 'all' | 't2v' | 'media' | 'size' | 'image' | 'frames' | 'speech'
type WanProfile = { kind: WanKind; resolutions: string[]; defaultResolution: string; durations: number[] }
// 与 new-api alibaba 插件已声明的 Wan 视频模型保持一致。
const WAN_PROFILES: Record<string, [WanKind, string[], string, number[]]> = {
  'wan3.0-video': ['all', ['480p', '720p', '1080p'], '1080p', Array.from({ length: 29 }, (_, i) => i + 2)],
  'wan3.0-video-prime': ['all', ['480p', '720p', '1080p'], '1080p', Array.from({ length: 29 }, (_, i) => i + 2)],
  'wan2.7-t2v': ['t2v', ['720p', '1080p'], '1080p', Array.from({ length: 14 }, (_, i) => i + 2)],
  'wan2.7-i2v': ['media', ['720p', '1080p'], '1080p', Array.from({ length: 14 }, (_, i) => i + 2)],
  'wan2.6-t2v': ['size', ['720p', '1080p'], '1080p', Array.from({ length: 14 }, (_, i) => i + 2)],
  'wan2.6-t2v-us': ['size', ['720p', '1080p'], '1080p', [5, 10, 15]],
  'wan2.6-i2v': ['image', ['720p', '1080p'], '1080p', Array.from({ length: 14 }, (_, i) => i + 2)],
  'wan2.6-i2v-flash': ['image', ['720p', '1080p'], '1080p', Array.from({ length: 14 }, (_, i) => i + 2)],
  'wan2.6-i2v-us': ['image', ['720p', '1080p'], '1080p', [5, 10, 15]],
  'wan2.5-t2v-preview': ['size', ['480p', '720p', '1080p'], '1080p', [5, 10]],
  'wan2.5-i2v-preview': ['image', ['480p', '720p', '1080p'], '1080p', [5, 10]],
  'wan2.2-t2v-plus': ['size', ['480p', '1080p'], '1080p', [5]],
  'wan2.2-i2v-flash': ['image', ['480p', '720p', '1080p'], '720p', [5]],
  'wan2.2-i2v-plus': ['image', ['480p', '1080p'], '1080p', [5]],
  'wan2.2-kf2v-flash': ['frames', ['480p', '720p', '1080p'], '720p', [5]],
  'wan2.2-s2v': ['speech', ['480p', '720p'], '480p', Array.from({ length: 19 }, (_, i) => i + 1)],
  'wanx2.1-t2v-plus': ['size', ['720p'], '720p', [5]],
  'wanx2.1-t2v-turbo': ['size', ['480p', '720p'], '720p', [5]],
  'wanx2.1-i2v-plus': ['image', ['720p'], '720p', [5]],
  'wanx2.1-i2v-turbo': ['image', ['480p', '720p'], '720p', [3, 4, 5]],
}

export function wanVideoProfile(model: string): WanProfile | undefined {
  const row = WAN_PROFILES[model.toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/^wan2\.1-/, 'wanx2.1-')]
  return row ? { kind: row[0], resolutions: row[1], defaultResolution: row[2], durations: row[3] } : undefined
}

export function newApiNativeVideoCapabilities(model: string, value?: unknown): VideoCapabilityConfig | undefined {
  const seedance = /^\[c\]/i.test(model.trim()) ? undefined : seedanceChannelCapabilities(model)
  const wan = wanVideoProfile(model)
  const h3 = /^minimax-h3$/i.test(model)
  const kling = /^kling-(?:v1|v1-6|v2-master)$/i.test(model)
  if (!seedance && !wan && !h3 && !kling) return undefined
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const configured = root.videoCapabilities && typeof root.videoCapabilities === 'object' ? root.videoCapabilities as Record<string, unknown> : root
  if (seedance) return videoCapabilities({
    ...seedance, ...configured, requestFormat: 'seedance', referenceMode: 'CONTENT_JSON',
    createPath: '/doubao/api/v3/contents/generations/tasks', statusPath: '/doubao/api/v3/contents/generations/tasks/{id}',
  })
  if (h3) return videoCapabilities({
    // DMC's H3 service exposes 768P / 1–15 seconds, separately from MiniMax's hosted API.
    ...configured, requestFormat: 'minimax-h3', referenceMode: 'CONTENT_JSON',
    resolutions: ['768p'], durations: Array.from({ length: 15 }, (_, i) => i + 1), defaultResolution: '768p', defaultDuration: 5,
    minDuration: 1, maxDuration: 15, maxReferences: 9, maxFirstLastFrames: 2, maxVideoReferences: 3, maxAudioReferences: 3,
    maxTotalReferences: 12, requiresPublicReferenceUrls: true, audioRequiresVisualReference: false,
    supportsAutoDuration: false, supportsVideoEditing: false,
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'], defaultAspectRatio: '16:9',
    createPath: '/hailuo/v2/video_generation', statusPath: '/hailuo/v2/query/video_generation/{id}',
  })
  if (kling) return videoCapabilities({
    ...configured, requestFormat: 'kling', referenceMode: 'KLING_JSON',
    resolutions: ['720p', '1080p'], defaultResolution: '720p', durations: [5, 10], defaultDuration: 5, minDuration: 5, maxDuration: 10,
    aspectRatios: ['16:9', '9:16', '1:1'], defaultAspectRatio: '16:9',
    maxReferences: 1, maxFirstLastFrames: 2, maxAudioReferences: 0, maxVideoReferences: 0,
    requiresPublicReferenceUrls: true, supportsAutoDuration: false, supportsVideoEditing: false,
    createPath: '/kling/v1/videos/text2video', statusPath: '/kling/v1/videos/text2video/{id}',
  })
  const profile = wan!
  const media = profile.kind === 'all' || profile.kind === 'media'
  return videoCapabilities({
    ...configured, requestFormat: 'wan', referenceMode: 'WAN_JSON',
    resolutions: profile.resolutions, durations: profile.durations, defaultResolution: profile.defaultResolution,
    defaultDuration: profile.durations.includes(5) ? 5 : profile.durations[0], minDuration: profile.durations[0], maxDuration: profile.durations.at(-1),
    aspectRatios: ['image', 'frames', 'speech', 'media'].includes(profile.kind) ? ['adaptive'] : ['16:9', '9:16', '1:1', '4:3', '3:4', ...(profile.kind === 'all' ? ['adaptive'] : [])],
    defaultAspectRatio: ['image', 'frames', 'speech', 'media'].includes(profile.kind) ? 'adaptive' : '16:9',
    maxReferences: profile.kind === 'all' ? 10 : profile.kind === 'frames' ? 2 : ['image', 'speech', 'media'].includes(profile.kind) ? 1 : 0,
    maxFirstLastFrames: profile.kind === 'frames' || media ? 2 : 0,
    maxVideoReferences: profile.kind === 'all' ? 5 : profile.kind === 'media' ? 1 : 0,
    maxAudioReferences: profile.kind === 'all' ? 5 : ['speech', 'media'].includes(profile.kind) ? 1 : 0,
    maxTotalReferences: 0, requiresPublicReferenceUrls: true, supportsAutoDuration: profile.kind === 'all',
    supportsVideoEditing: false, audioRequiresVisualReference: false,
    createPath: `/ali/api/v1/services/aigc/${['frames', 'speech'].includes(profile.kind) ? 'image2video' : 'video-generation'}/video-synthesis`,
    statusPath: '/ali/api/v1/tasks/{id}',
  })
}

/** NEW_API 凭据通常以 /v1 结尾，原生插件路径位于同一网关根目录。 */
export function videoProviderUrl(baseUrl: string, path: string) {
  return /^(?:\/doubao\/|\/ali\/|\/hailuo\/|\/kling\/)/.test(path)
    ? `${baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}${path}` : `${baseUrl}${path}`
}

export function wanVideoRequest(model: string, prompt: string, options: NormalizedVideoOptions, images: string[], videos: string[], audios: string[]) {
  const profile = wanVideoProfile(model)
  if (!profile) throw new BadRequestException('未配置该 Wan 模型的原生视频协议')
  const input: Record<string, unknown> = { prompt }
  const parameters: Record<string, unknown> = { duration: options.duration }
  if (options.watermark !== undefined) parameters.watermark = options.watermark
  if (options.generateAudio !== undefined) parameters.audio = options.generateAudio
  if (profile.kind === 'size') {
    const sizes: Record<string, Record<string, string>> = {
      '480p': { '16:9': '832*480', '9:16': '480*832', '1:1': '624*624' },
      '720p': { '16:9': '1280*720', '9:16': '720*1280', '1:1': '960*960', '4:3': '1088*832', '3:4': '832*1088' },
      '1080p': { '16:9': '1920*1080', '9:16': '1080*1920', '1:1': '1440*1440', '4:3': '1632*1248', '3:4': '1248*1632' },
    }
    const size = sizes[options.resolution]?.[options.aspectRatio]
    if (!size) throw new BadRequestException('当前 Wan 分辨率不支持该比例')
    parameters.size = size
  } else {
    parameters.resolution = options.resolution.toUpperCase()
    if (profile.kind === 'all' || profile.kind === 't2v') parameters.ratio = options.aspectRatio
  }
  if (profile.kind === 'all' || profile.kind === 'media') {
    const frames = options.imageRole !== 'reference_image'
    input.media = [
      ...images.map((url, index) => ({ type: frames ? options.imageRole === 'first_last_frame' ? index === 0 ? 'first_frame' : 'last_frame' : options.imageRole : profile.kind === 'media' ? 'first_frame' : 'reference_image', url })),
      ...videos.map((url) => ({ type: profile.kind === 'media' ? 'first_clip' : 'reference_video', url })),
      ...audios.map((url) => ({ type: profile.kind === 'media' ? 'driving_audio' : 'reference_audio', url })),
    ]
    if (profile.kind === 'media' && (!images.length && !videos.length || videos.length && (images.length || audios.length))) throw new BadRequestException('Wan 2.7 图生视频需要首帧或单段参考视频，参考视频不能混用首帧或音频')
  } else if (profile.kind === 'frames') {
    if (!images.length) throw new BadRequestException('当前 Wan 首尾帧模型需要首帧图片')
    if (options.imageRole === 'last_frame') throw new BadRequestException('当前 Wan 首尾帧模型不能只提供尾帧')
    input.first_frame_url = images[0]
    if (images[1]) input.last_frame_url = images[1]
  } else if (profile.kind === 'speech') {
    if (!images[0] || !audios[0]) throw new BadRequestException('当前 Wan 语音驱动模型需要一张图片和一段音频')
    input.image_url = images[0]
    input.audio_url = audios[0]
    delete parameters.duration
  } else if (profile.kind === 'image') {
    if (!images[0]) throw new BadRequestException('当前 Wan 图生视频模型需要一张参考图')
    input.img_url = images[0]
  }
  return { model, input, parameters }
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
  const resolutions = Array.isArray(raw.resolutions) ? [...new Set(raw.resolutions.map(String).map((item) => item.trim().toLowerCase()).filter((item) => /^(\d{3,4}p|2k(?:-pro)?|4k)$/.test(item)))].slice(0, 10) : DEFAULTS.resolutions
  const durations = Array.isArray(raw.durations) ? [...new Set(raw.durations.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 300))].sort((a, b) => a - b).slice(0, 300) : DEFAULTS.durations
  const aspectRatios = Array.isArray(raw.aspectRatios) ? [...new Set(raw.aspectRatios.map(String).filter((item) => /^(\d{1,2}:\d{1,2}|adaptive)$/.test(item)))].slice(0, 10) : DEFAULTS.aspectRatios
  const safeResolutions = resolutions.length ? resolutions : DEFAULTS.resolutions
  const safeDurations = durations.length ? durations : DEFAULTS.durations
  const safeRatios = aspectRatios.length ? aspectRatios : DEFAULTS.aspectRatios
  const defaultResolution = safeResolutions.includes(String(raw.defaultResolution).toLowerCase()) ? String(raw.defaultResolution).toLowerCase() : safeResolutions[0]
  const requestedDuration = Number(raw.defaultDuration)
  const defaultDuration = safeDurations.includes(requestedDuration) ? requestedDuration : safeDurations[0]
  const defaultAspectRatio = safeRatios.includes(String(raw.defaultAspectRatio)) ? String(raw.defaultAspectRatio) : safeRatios[0]
  const gateway = raw.requestProtocol === 'openai_video'
  return {
    resolutions: safeResolutions,
    durations: safeDurations,
    aspectRatios: safeRatios,
    defaultResolution,
    defaultDuration,
    defaultAspectRatio,
    pricing: pricingMap(raw.pricing),
    createPath: gateway ? DEFAULTS.createPath : safePath(raw.createPath, DEFAULTS.createPath),
    statusPath: gateway ? DEFAULTS.statusPath : safePath(raw.statusPath, DEFAULTS.statusPath),
    contentPath: gateway ? DEFAULTS.contentPath : safePath(raw.contentPath, DEFAULTS.contentPath),
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
    requestFormat: raw.requestFormat === 'seedance' || raw.requestFormat === 'minimax-h3' || raw.requestFormat === 'wan' || raw.requestFormat === 'kling' ? raw.requestFormat : null,
    requestProtocol: gateway ? 'openai_video' : null,
    referenceMode: raw.referenceMode === 'CONTENT_JSON' || raw.referenceMode === 'DATA_URL_JSON' || raw.referenceMode === 'WAN_JSON' || raw.referenceMode === 'KLING_JSON' ? raw.referenceMode : DEFAULTS.referenceMode,
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
  const referenceVideos = inlineMediaList(options.referenceVideos, 'video')
  const referenceImageUrls = publicHttpsUrls(options.referenceImageUrls, '参考图')
  const referenceAudioUrls = publicHttpsUrls(options.referenceAudioUrls, '参考音频')
  const referenceVideoUrls = publicHttpsUrls(options.referenceVideoUrls, '参考视频')
  const videoReferenceCount = referenceVideoUrls.length + referenceVideos.length
  const referenceCount = referenceAssetIds.length + referenceImages.length + referenceImageUrls.length
  const audioCount = audioAssetIds.length + referenceAudios.length + referenceAudioUrls.length
  const imageRole = options.imageRole === 'first_frame' || options.imageRole === 'last_frame' || options.imageRole === 'first_last_frame' ? options.imageRole : 'reference_image'
  const frameCount = imageRole === 'first_last_frame' ? 2 : imageRole === 'reference_image' ? 0 : 1
  if (!capabilities.resolutions.includes(resolution)) throw new BadRequestException('当前视频模型不支持该分辨率')
  if (!(duration === -1 && capabilities.supportsAutoDuration) && (!Number.isInteger(duration) || duration < capabilities.minDuration || duration > capabilities.maxDuration)) {
    throw new BadRequestException(`video.duration must be between ${capabilities.minDuration} and ${capabilities.maxDuration} seconds`)
  }
  if (!capabilities.aspectRatios.includes(aspectRatio)) throw new BadRequestException('当前视频模型不支持该画面比例')
  if ((capabilities.requestFormat === 'wan' || capabilities.requestFormat === 'kling') && !capabilities.durations.includes(duration) && !(duration === -1 && capabilities.supportsAutoDuration)) throw new BadRequestException('当前模型不支持该时长')
  if ((capabilities.requestFormat === 'wan' || capabilities.requestFormat === 'kling') && options.returnLastFrame === true) throw new BadRequestException('当前模型不支持返回尾帧')
  if (capabilities.requestFormat === 'minimax-h3' && options.returnLastFrame === true) {
    throw new BadRequestException('当前 MiniMax H3 请求格式不支持 returnLastFrame')
  }
  if (capabilities.requestFormat === 'minimax-h3' && (options.generateAudio !== undefined || options.watermark !== undefined || options.videoFormat !== undefined || options.videoTaskType !== undefined)) {
    throw new BadRequestException('当前 MiniMax H3 渠道不接受 generateAudio、watermark、videoFormat 或 videoTaskType 参数')
  }
  if (capabilities.requestFormat === 'minimax-h3' && aspectRatio === 'adaptive' && !referenceCount && !videoReferenceCount) throw new BadRequestException('MiniMax H3 仅在提供参考图或参考视频时支持 adaptive 比例')
  const priority = options.priority === undefined ? undefined : Number(options.priority)
  const executionExpiresAfter = options.executionExpiresAfter === undefined ? undefined : Number(options.executionExpiresAfter)
  const safetyIdentifier = options.safetyIdentifier === undefined ? undefined : String(options.safetyIdentifier)
  const tools = Array.isArray(options.tools) ? options.tools.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : undefined
  if (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 9)) throw new BadRequestException('priority must be between 0 and 9')
  if (executionExpiresAfter !== undefined && (!Number.isInteger(executionExpiresAfter) || executionExpiresAfter < 3600 || executionExpiresAfter > 259200)) throw new BadRequestException('executionExpiresAfter must be between 3600 and 259200 seconds')
  if (safetyIdentifier !== undefined && (!safetyIdentifier || safetyIdentifier.length > 64 || /[^\x20-\x7e]/.test(safetyIdentifier))) throw new BadRequestException('safetyIdentifier must be printable ASCII up to 64 characters')
  if (options.tools !== undefined && (!tools || tools.length !== 1 || tools[0].type !== 'web_search')) throw new BadRequestException('tools only supports one web_search item')
  if (capabilities.requestFormat !== 'seedance' && (priority !== undefined || executionExpiresAfter !== undefined || safetyIdentifier !== undefined || tools !== undefined)) throw new BadRequestException('当前模型不支持该高级视频选项')
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
  if (videoReferenceCount > capabilities.maxVideoReferences) throw new BadRequestException(`当前视频模型最多支持 ${capabilities.maxVideoReferences} 段参考视频`)
  if (capabilities.maxTotalReferences && referenceCount + audioCount + videoReferenceCount > capabilities.maxTotalReferences) throw new BadRequestException(`当前视频模型最多支持 ${capabilities.maxTotalReferences} 个参考素材`)
  if (audioCount && capabilities.audioRequiresVisualReference && !referenceCount && !videoReferenceCount) throw new BadRequestException('参考音频必须搭配至少一张参考图或参考视频')
  if (frameCount > capabilities.maxFirstLastFrames) throw new BadRequestException('当前视频模型不支持所选首尾帧模式')
  if (imageRole !== 'reference_image' && (referenceCount !== frameCount || audioCount || videoReferenceCount)) throw new BadRequestException('首帧或尾帧需要一张图片，首尾帧需要两张图片，且不能混用参考音频或视频')
  if (options.faceRequired === true && capabilities.faceSupported !== true) throw new BadRequestException('当前渠道未声明人脸参考支持')
  let videoTaskType = options.videoTaskType as NormalizedVideoOptions['videoTaskType']
  if (videoTaskType !== undefined && !['auto', 'reference', 'edit', 'extend'].includes(videoTaskType)) throw new BadRequestException('视频生成模式无效')
  if (videoTaskType && !capabilities.supportsVideoEditing) throw new BadRequestException('当前模型不支持视频编辑模式')
  const referenceScenario = imageRole === 'reference_image' && referenceCount + videoReferenceCount + audioCount > 0
  if (videoTaskType === 'reference' && !referenceScenario) throw new BadRequestException('参考生成需要普通参考图、参考视频或参考音频，不能使用首尾帧模式')
  if (videoTaskType === 'auto' && !referenceScenario) videoTaskType = undefined
  if ((videoTaskType === 'edit' || videoTaskType === 'extend') && (!videoReferenceCount || aspectRatio !== 'adaptive' || (videoTaskType === 'edit' && duration !== -1))) throw new BadRequestException('编辑和延长需要参考视频及 adaptive 比例；编辑需要自动时长')
  if (capabilities.requestFormat === 'seedance' && capabilities.supportsVideoEditing && imageRole !== 'reference_image' && aspectRatio !== 'adaptive') throw new BadRequestException('Seedance 2.5 的首帧和首尾帧需要 adaptive 比例')
  const videoFormat = options.videoFormat as NormalizedVideoOptions['videoFormat']
  if (videoFormat !== undefined && (!capabilities.supportsVideoEditing || !['mp4', 'mov'].includes(videoFormat))) throw new BadRequestException('当前模型不支持该视频格式')
  return { resolution, duration, aspectRatio, referenceAssetIds, audioAssetIds, referenceImages, referenceAudios, referenceVideos, referenceImageUrls, referenceAudioUrls, referenceVideoUrls, imageRole,
    ...(options.faceRequired === true ? { faceRequired: true } : {}),
    ...(typeof options.generateAudio === 'boolean' ? { generateAudio: options.generateAudio } : {}),
    ...(typeof options.watermark === 'boolean' ? { watermark: options.watermark } : {}),
    ...(typeof options.returnLastFrame === 'boolean' ? { returnLastFrame: options.returnLastFrame } : {}),
    ...(priority !== undefined ? { priority } : {}), ...(executionExpiresAfter !== undefined ? { executionExpiresAfter } : {}),
    ...(safetyIdentifier !== undefined ? { safetyIdentifier } : {}), ...(tools ? { tools } : {}),
    ...(videoTaskType ? { videoTaskType } : {}), ...(videoFormat ? { videoFormat } : {}),
  }
}

/** 内联参考素材：只接受对应类型的 Data URL。 */
function inlineMediaList(value: unknown, kind: 'image' | 'audio' | 'video') {
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
