export type ModelCapability = 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'

export type CatalogModel = {
  id?: string
  key: string
  displayName: string
  upstreamModel?: string
  description?: string
  capability: ModelCapability
  enabled?: boolean
  isDefault: boolean
  badge?: string
  source?: 'PLATFORM' | 'USER'
  availability?: 'AVAILABLE' | 'DEGRADED' | 'UNCONFIGURED'
  healthyRouteCount?: number
  routeCount?: number
  vendor?: { id?: string; key?: string; name: string } | null
  provider?: { id?: string; name?: string; type?: string } | null
  flatCreditCost?: number
  effectiveCreditCost?: number
  options?: {
    agentEnabled?: boolean
    agentCapabilities?: {
      eligible?: boolean
      confidence?: 'confirmed' | 'compatible' | 'limited'
      supportsTools?: boolean
      supportsStructuredOutput?: boolean
      supportsReasoning?: boolean
      supportsWebSearch?: boolean
      supportsVision?: boolean
      contextWindow?: number | null
      maxOutputTokens?: number | null
      reason?: string
    }
    discovery?: {
      contextWindow?: number | null
      maxOutputTokens?: number | null
      features?: string[]
    }
    imageCapabilities?: {
      sizes?: string[]
      qualities?: string[]
      outputFormats?: string[]
      backgrounds?: string[]
      maxCount?: number
      defaultSize?: string
      defaultQuality?: string
      supportsReference?: boolean
      supportsMask?: boolean
      resolutionPricing?: Record<string, number>
    }
    videoCapabilities?: {
      resolutions?: string[]
      durations?: number[]
      aspectRatios?: string[]
      defaultResolution?: string
      defaultDuration?: number
      defaultAspectRatio?: string
      pricing?: Record<string, number>
    }
  }
}

export function isAgentModelEligible(model: CatalogModel) {
  if (model.capability !== 'CHAT' || model.enabled === false || model.options?.agentEnabled === false) return false
  const contextWindow = model.options?.agentCapabilities?.contextWindow ?? model.options?.discovery?.contextWindow
  if (model.options?.agentEnabled === true) return model.options?.agentCapabilities?.eligible !== false
  return model.options?.agentCapabilities?.eligible !== false && (!contextWindow || contextWindow >= 8192)
}

export function agentModelDescription(model: CatalogModel) {
  const capability = model.options?.agentCapabilities
  if (!isAgentModelEligible(model)) return capability?.reason || '未开放 Agent 任务'
  const labels = [capability?.supportsReasoning ? '推理' : '', capability?.supportsTools ? '工具调用' : '', capability?.supportsStructuredOutput ? '结构化输出' : ''].filter(Boolean)
  return labels.length ? `Agent · ${labels.join(' · ')}` : 'Agent · 服务端工具编排'
}

export function findCatalogModel(models: CatalogModel[], value: string, capability?: ModelCapability) {
  const normalized = value.trim()
  if (!normalized) return undefined
  const candidates = capability ? models.filter((item) => item.capability === capability) : models
  return candidates.find((item) => item.key === normalized)
    || candidates.find((item) => item.displayName === normalized)
    || candidates.find((item) => item.upstreamModel === normalized)
}

export function defaultCatalogModel(models: CatalogModel[], capability: ModelCapability) {
  return models.find((item) => item.capability === capability && item.isDefault)
    || models.find((item) => item.capability === capability)
}

export function catalogModelKey(models: CatalogModel[], value: string, capability?: ModelCapability) {
  return findCatalogModel(models, value, capability)?.key || value.trim()
}

export function catalogModelLabel(models: CatalogModel[], value: string, capability?: ModelCapability) {
  return findCatalogModel(models, value, capability)?.displayName || value.trim()
}
