import { BadRequestException } from '@nestjs/common'

export type NormalizedVideoOptions = {
  resolution: string
  duration: number
  aspectRatio: string
  referenceAssetIds: string[]
  audioAssetIds: string[]
}

/**
 * 参考素材传输方式：
 * - INPUT_REFERENCE：multipart 的 input_reference 字段，单张参考图（旧行为）；
 * - DATA_URL_JSON：JSON 的 images/audios 数组，使用 base64 Data URL。
 */
export type VideoReferenceMode = 'INPUT_REFERENCE' | 'DATA_URL_JSON'

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
  maxPollSeconds: 600,
  maxReferences: 1,
  maxAudioReferences: 0,
  referenceMode: 'INPUT_REFERENCE',
  minDuration: MIN_VIDEO_DURATION_SECONDS,
  maxDuration: MAX_VIDEO_DURATION_SECONDS,
  resolutionLocked: false,
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
  const resolutions = Array.isArray(raw.resolutions) ? [...new Set(raw.resolutions.map(String).map((item) => item.trim().toLowerCase()).filter((item) => /^\d{3,4}p$/.test(item)))].slice(0, 10) : DEFAULTS.resolutions
  const durations = Array.isArray(raw.durations) ? [...new Set(raw.durations.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 300))].sort((a, b) => a - b).slice(0, 20) : DEFAULTS.durations
  const aspectRatios = Array.isArray(raw.aspectRatios) ? [...new Set(raw.aspectRatios.map(String).filter((item) => /^\d{1,2}:\d{1,2}$/.test(item)))].slice(0, 10) : DEFAULTS.aspectRatios
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
    maxPollSeconds: Math.max(30, Math.min(3600, Number(raw.maxPollSeconds) || DEFAULTS.maxPollSeconds)),
    maxReferences: Math.max(0, Math.min(16, Number.isInteger(Number(raw.maxReferences)) ? Number(raw.maxReferences) : DEFAULTS.maxReferences)),
    maxAudioReferences: Math.max(0, Math.min(8, Number.isInteger(Number(raw.maxAudioReferences)) ? Number(raw.maxAudioReferences) : DEFAULTS.maxAudioReferences)),
    referenceMode: raw.referenceMode === 'DATA_URL_JSON' ? 'DATA_URL_JSON' : DEFAULTS.referenceMode,
    minDuration: Math.max(MIN_VIDEO_DURATION_SECONDS, Math.min(MAX_VIDEO_DURATION_SECONDS, Number.isInteger(Number(raw.minDuration)) ? Number(raw.minDuration) : DEFAULTS.minDuration)),
    maxDuration: Math.max(MIN_VIDEO_DURATION_SECONDS, Math.min(MAX_VIDEO_DURATION_SECONDS, Number.isInteger(Number(raw.maxDuration)) ? Number(raw.maxDuration) : DEFAULTS.maxDuration)),
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
  if (!capabilities.resolutions.includes(resolution)) throw new BadRequestException('当前视频模型不支持该分辨率')
  if (!Number.isInteger(duration) || duration < capabilities.minDuration || duration > capabilities.maxDuration) {
    throw new BadRequestException(`video.duration must be between ${capabilities.minDuration} and ${capabilities.maxDuration} seconds`)
  }
  if (!capabilities.aspectRatios.includes(aspectRatio)) throw new BadRequestException('当前视频模型不支持该画面比例')
  if (referenceAssetIds.length > capabilities.maxReferences) {
    throw new BadRequestException(capabilities.maxReferences
      ? `当前视频模型最多支持 ${capabilities.maxReferences} 张参考图`
      : '当前视频模型不支持参考图')
  }
  if (audioAssetIds.length > capabilities.maxAudioReferences) {
    throw new BadRequestException(capabilities.maxAudioReferences
      ? `当前视频模型最多支持 ${capabilities.maxAudioReferences} 段参考音频`
      : '当前视频模型不支持参考音频')
  }
  if (audioAssetIds.length && !referenceAssetIds.length) throw new BadRequestException('参考音频必须搭配至少一张参考图')
  return { resolution, duration, aspectRatio, referenceAssetIds, audioAssetIds }
}

function assetIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).filter((item) => /^[A-Za-z0-9_-]{1,100}$/.test(item)))].slice(0, 16)
    : []
}

export function videoCreditCost(options: NormalizedVideoOptions, configuredCapabilities: unknown, fallback: number) {
  const configured = videoCapabilities(configuredCapabilities).pricing[`${options.resolution}:${options.duration}`]
  if (configured !== undefined) return configured
  const resolutionMultiplier = options.resolution === '2160p' ? 4 : options.resolution === '1080p' ? 2 : 1
  return Math.max(0, fallback) * resolutionMultiplier * Math.max(1, Math.ceil(options.duration / 5))
}
