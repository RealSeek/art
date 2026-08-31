import { AssetKind, Prisma } from '@prisma/client'

export const publicAssetSelect = {
  id: true,
  projectId: true,
  teamId: true,
  kind: true,
  name: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  metadata: true,
  createdAt: true,
} as const satisfies Prisma.AssetSelect

const publicOptionKeys = [
  'requestedModel',
  'size',
  'ratio',
  'quality',
  'style',
  'count',
  'modules',
  'creationType',
  'platform',
  'referenceAssetIds',
  'maskAssetId',
  'outputFormat',
  'outputCompression',
  'background',
  'resolution',
  'duration',
  'aspectRatio',
  'pluginId',
  'creationToolId',
  'assistantId',
  'webSearchEnabled',
  'webSearchSources',
  'responseMode',
  'officeMode',
  'officeSkill',
  'taskType',
  'assetId',
  'mode',
  'language',
  'imagePromptResult',
] as const

export type PublicAssetSource = Prisma.AssetGetPayload<{ select: typeof publicAssetSelect }> & {
  team?: { id: string; name: string } | null
  user?: { id: string; displayName: string } | null
}

export class PublicAssetDto {
  id!: string
  projectId!: string | null
  teamId!: string | null
  kind!: AssetKind
  name!: string
  mimeType!: string
  size!: number
  width!: number | null
  height!: number | null
  metadata!: Record<string, unknown> | null
  createdAt!: Date
  contentUrl!: string
  team?: { id: string; name: string } | null
  user?: { id: string; displayName: string } | null
  canManage?: boolean
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function pick(value: Record<string, unknown>, keys: readonly string[]) {
  const result: Record<string, unknown> = {}
  for (const key of keys) if (value[key] !== undefined) result[key] = value[key]
  return result
}

export function publicAssetOptions(value: unknown) {
  return pick(recordOf(value), publicOptionKeys)
}

export function publicAssetMetadata(value: unknown) {
  const metadata = recordOf(value)
  if (!Object.keys(metadata).length) return null
  const result = pick(metadata, ['purpose', 'prompt', 'model', 'jobId', 'position', 'moduleLabel', 'creationType', 'platform'])
  if (metadata.options !== undefined) result.options = publicAssetOptions(metadata.options)
  return result
}

export function toPublicAsset(
  asset: PublicAssetSource,
  options: { contentUrl?: string; canManage?: boolean } = {},
): PublicAssetDto {
  return {
    id: asset.id,
    projectId: asset.projectId,
    teamId: asset.teamId,
    kind: asset.kind,
    name: asset.name,
    mimeType: asset.mimeType,
    size: Number(asset.size),
    width: asset.width,
    height: asset.height,
    metadata: publicAssetMetadata(asset.metadata),
    createdAt: asset.createdAt,
    contentUrl: options.contentUrl || `/v1/assets/${asset.id}/content`,
    ...(asset.team !== undefined ? { team: asset.team } : {}),
    ...(asset.user !== undefined ? { user: asset.user } : {}),
    ...(options.canManage !== undefined ? { canManage: options.canManage } : {}),
  }
}
