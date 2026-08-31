import { JobKind, JobStatus, Prisma } from '@prisma/client'
import { PublicAssetDto, publicAssetOptions, publicAssetSelect, toPublicAsset } from '../assets/public-asset.dto'
import { publicGenerationError } from './generation-errors'

const publicGenerationBaseSelect = {
  id: true,
  projectId: true,
  conversationId: true,
  kind: true,
  status: true,
  model: true,
  prompt: true,
  options: true,
  creditCost: true,
  inputTokens: true,
  outputTokens: true,
  cachedInputTokens: true,
  reasoningTokens: true,
  errorMessage: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  outputs: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      assetId: true,
      position: true,
      asset: { select: publicAssetSelect },
    },
  },
} as const satisfies Prisma.GenerationJobSelect

export const publicGenerationListSelect = publicGenerationBaseSelect

export const publicGenerationDetailSelect = {
  ...publicGenerationBaseSelect,
  events: { orderBy: { sequence: 'asc' }, take: 500 },
} as const satisfies Prisma.GenerationJobSelect

export type PublicGenerationRecord = Prisma.GenerationJobGetPayload<{ select: typeof publicGenerationListSelect }>
export type PublicGenerationDetailRecord = Prisma.GenerationJobGetPayload<{ select: typeof publicGenerationDetailSelect }>

export class PublicGenerationUsageDto {
  inputTokens!: number
  outputTokens!: number
  totalTokens!: number
  cachedTokens!: number
  reasoningTokens!: number
}

export class PublicGenerationAssetDto extends PublicAssetDto {}

export class PublicGenerationEventDto {
  id!: string
  sequence!: number
  type!: string
  payload!: Record<string, unknown>
  createdAt!: Date
}

export class PublicGenerationDto {
  id!: string
  projectId!: string | null
  conversationId!: string | null
  kind!: JobKind
  status!: JobStatus
  model!: string
  prompt!: string
  options!: Record<string, unknown>
  creditCost!: number
  inputTokens!: number
  outputTokens!: number
  cachedInputTokens!: number
  reasoningTokens!: number
  usage!: PublicGenerationUsageDto
  errorMessage!: string | null
  startedAt!: Date | null
  completedAt!: Date | null
  createdAt!: Date
  updatedAt!: Date
  outputs!: Array<{ id: string; assetId: string; position: number; asset: PublicGenerationAssetDto }>
  events?: PublicGenerationEventDto[]
  stream!: PublicGenerationStreamDto | null
}

export class PublicGenerationStreamDto {
  messageId!: string
  content!: string
  model!: string | null
  metadata!: Record<string, unknown> | null
}

export type PublicGenerationStream = {
  messageId: string
  content: string
  model: string | null
  metadata: Prisma.JsonValue | null
} | null

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pick(value: Record<string, unknown>, keys: readonly string[]) {
  const result: Record<string, unknown> = {}
  for (const key of keys) if (value[key] !== undefined) result[key] = value[key]
  return result
}

export function publicGenerationOptions(value: unknown) {
  return publicAssetOptions(value)
}

function publicWebSearch(value: unknown) {
  const search = recordOf(value)
  if (!Object.keys(search).length) return undefined
  const result = pick(search, ['enabled', 'status', 'queries', 'sources'])
  if (typeof search.error === 'string' && search.error.trim()) result.error = '搜索暂时不可用'
  return result
}

function publicStreamMetadata(value: unknown) {
  const metadata = recordOf(value)
  if (!Object.keys(metadata).length) return null
  const result = pick(metadata, ['reasoning', 'suggestionVersion', 'suggestions'])
  const webSearch = publicWebSearch(metadata.webSearch)
  if (webSearch) result.webSearch = webSearch
  return result
}

function numberField(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

export function toPublicGenerationEvent(
  event: { id: string; sequence: number; type: string; payload: unknown; createdAt: Date },
  kind: JobKind,
): PublicGenerationEventDto {
  const payload = recordOf(event.payload)
  let publicPayload: Record<string, unknown>
  switch (event.type) {
    case 'queued':
      publicPayload = pick(payload, ['kind', 'model'])
      break
    case 'text_delta':
    case 'thinking_delta':
      publicPayload = pick(payload, ['textDelta', 'reasoningDelta'])
      break
    case 'usage': {
      const inputTokens = numberField(payload.inputTokens)
      const outputTokens = numberField(payload.outputTokens)
      publicPayload = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cachedTokens: numberField(payload.cachedInputTokens),
        reasoningTokens: numberField(payload.reasoningTokens),
      }
      break
    }
    case 'tool_call':
      publicPayload = pick(payload, ['id', 'name', 'inputKeys'])
      break
    case 'tool_result':
      publicPayload = pick(payload, ['id', 'name', 'status', 'durationMs'])
      break
    case 'tool_loop':
      publicPayload = pick(payload, ['round', 'calls', 'results', 'exhausted'])
      break
    case 'done':
      publicPayload = { status: JobStatus.SUCCEEDED }
      break
    case 'cancelled':
      publicPayload = { reason: 'user_request' }
      break
    case 'error':
      publicPayload = { message: publicGenerationError(kind, JobStatus.FAILED, typeof payload.message === 'string' ? payload.message : null) }
      break
    default:
      publicPayload = {}
  }
  return { id: event.id, sequence: event.sequence, type: event.type, payload: publicPayload, createdAt: event.createdAt }
}

export function toPublicGeneration(
  job: PublicGenerationRecord | PublicGenerationDetailRecord,
  stream: PublicGenerationStream = null,
): PublicGenerationDto {
  const inputTokens = numberField(job.inputTokens)
  const outputTokens = numberField(job.outputTokens)
  const cachedInputTokens = numberField(job.cachedInputTokens)
  const reasoningTokens = numberField(job.reasoningTokens)
  const events = 'events' in job
    ? job.events.map((event) => toPublicGenerationEvent(event, job.kind))
    : undefined
  return {
    id: job.id,
    projectId: job.projectId,
    conversationId: job.conversationId,
    kind: job.kind,
    status: job.status,
    model: job.model,
    prompt: job.prompt,
    options: publicGenerationOptions(job.options),
    creditCost: job.creditCost,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedTokens: cachedInputTokens,
      reasoningTokens,
    },
    errorMessage: publicGenerationError(job.kind, job.status, job.errorMessage),
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputs: job.outputs.map((output) => ({
      id: output.id,
      assetId: output.assetId,
      position: output.position,
      asset: toPublicAsset(output.asset),
    })),
    ...(events ? { events } : {}),
    stream: stream ? { ...stream, metadata: publicStreamMetadata(stream.metadata) } : null,
  }
}
