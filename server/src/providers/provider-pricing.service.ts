import { BadRequestException, Injectable } from '@nestjs/common'
import { ModelCapability, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ModelDiscoveryService } from './model-discovery.service'

const DEFAULT_MODEL_PRICE_CATALOG_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

export type ModelPricingFields = {
  flatCreditCost: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
}

export function modelPricingFields(model: ModelPricingFields): ModelPricingFields {
  return {
    flatCreditCost: model.flatCreditCost,
    inputCreditsPerMillion: model.inputCreditsPerMillion,
    outputCreditsPerMillion: model.outputCreditsPerMillion,
    inputCostMicrosPerMillion: model.inputCostMicrosPerMillion,
    outputCostMicrosPerMillion: model.outputCostMicrosPerMillion,
    imageCostMicros: model.imageCostMicros,
    videoCostMicros: model.videoCostMicros,
  }
}

@Injectable()
export class ProviderPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modelDiscovery: ModelDiscoveryService,
  ) {}

  async discover(payload: unknown, markupPercent?: number, forceRefresh = false) {
    const settings = await this.prisma.systemSetting.findUnique({
      where: { id: 'global' },
      select: {
        creditValueMicros: true,
        pricingUsdExchangeRateMicros: true,
        modelImportMarkupPercent: true,
        modelPriceCatalogUrl: true,
        modelPriceCatalogRefreshHours: true,
      },
    })
    return this.modelDiscovery.discover(payload, {
      creditValueMicros: settings?.creditValueMicros ?? 10_000,
      pricingUsdExchangeRateMicros: settings?.pricingUsdExchangeRateMicros ?? 1_000_000,
      markupPercent: markupPercent ?? settings?.modelImportMarkupPercent ?? 130,
      catalogUrl: settings?.modelPriceCatalogUrl,
      refreshHours: settings?.modelPriceCatalogRefreshHours,
      forceRefresh,
    })
  }

  async comparison(markupPercent?: number, forceRefresh = true) {
    const [models, settings] = await Promise.all([
      this.prisma.modelPreset.findMany({ orderBy: [{ capability: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.systemSetting.findUnique({
        where: { id: 'global' },
        select: {
          currency: true,
          creditValueMicros: true,
          pricingUsdExchangeRateMicros: true,
          modelImportMarkupPercent: true,
          modelPriceCatalogUrl: true,
        },
      }),
    ])
    const effectiveMarkup = Math.max(100, Math.min(markupPercent ?? settings?.modelImportMarkupPercent ?? 130, 1000))
    const creditValueMicros = Math.max(1, settings?.creditValueMicros ?? 10_000)
    const pricingUsdExchangeRateMicros = Math.max(1, settings?.pricingUsdExchangeRateMicros ?? 1_000_000)
    const discovered = await this.discover(models.map((model) => ({ id: model.upstreamModel })), effectiveMarkup, forceRefresh)
    const candidates = new Map(discovered.map((candidate) => [candidate.id, candidate]))
    const ratio = (credits: number, costMicros: number) => costMicros > 0
      ? Number((credits * creditValueMicros * 100 / (costMicros * pricingUsdExchangeRateMicros / 1_000_000)).toFixed(2))
      : null

    return {
      markupPercent: effectiveMarkup,
      currency: settings?.currency || 'CNY',
      creditValueMicros,
      pricingUsdExchangeRateMicros,
      catalogUrl: settings?.modelPriceCatalogUrl || DEFAULT_MODEL_PRICE_CATALOG_URL,
      refreshedAt: new Date().toISOString(),
      models: models.map((model) => {
        const candidate = candidates.get(model.upstreamModel)
        const available = Boolean(candidate && candidate.pricingSource !== 'none' && (
          model.capability === ModelCapability.CHAT
            ? candidate.inputCostMicrosPerMillion || candidate.outputCostMicrosPerMillion
            : model.capability === ModelCapability.VIDEO
              ? candidate.videoCostMicros
              : candidate.imageCostMicros
        ))
        const current = modelPricingFields(model)
        const suggested: ModelPricingFields | null = available ? {
          flatCreditCost: candidate!.flatCreditCost || model.flatCreditCost,
          inputCreditsPerMillion: candidate!.inputCreditsPerMillion,
          outputCreditsPerMillion: candidate!.outputCreditsPerMillion,
          inputCostMicrosPerMillion: candidate!.inputCostMicrosPerMillion,
          outputCostMicrosPerMillion: candidate!.outputCostMicrosPerMillion,
          imageCostMicros: candidate!.imageCostMicros,
          videoCostMicros: candidate!.videoCostMicros,
        } : null
        return {
          id: model.id,
          key: model.key,
          displayName: model.displayName,
          upstreamModel: model.upstreamModel,
          capability: model.capability,
          available,
          pricingSource: candidate?.pricingSource || 'none',
          current,
          suggested,
          changed: Boolean(suggested && JSON.stringify(current) !== JSON.stringify(suggested)),
          currentInputMarkupPercent: model.capability === ModelCapability.CHAT ? ratio(model.inputCreditsPerMillion, candidate?.inputCostMicrosPerMillion || model.inputCostMicrosPerMillion) : null,
          currentOutputMarkupPercent: model.capability === ModelCapability.CHAT ? ratio(model.outputCreditsPerMillion, candidate?.outputCostMicrosPerMillion || model.outputCostMicrosPerMillion) : null,
          warnings: candidate?.warnings || ['价格目录未命中，请保留人工定价'],
        }
      }),
    }
  }

  async apply(
    input: { modelIds: string[]; markupPercent?: number },
    updateModel: (id: string, input: Prisma.ModelPresetUncheckedUpdateInput) => Promise<unknown>,
  ) {
    const selected = [...new Set(input.modelIds.map((id) => id.trim()).filter(Boolean))]
    if (!selected.length) throw new BadRequestException('请选择需要更新价格的模型')
    const comparison = await this.comparison(input.markupPercent, false)
    const rows = comparison.models.filter((model) => selected.includes(model.id))
    if (rows.length !== selected.length) throw new BadRequestException('包含不存在的模型')
    const applicable = rows.filter((model) => model.available && model.changed && model.suggested)
    if (!applicable.length) throw new BadRequestException('所选模型没有可应用的价格目录数据')
    for (const row of applicable) await updateModel(row.id, row.suggested!)
    return {
      selected: selected.length,
      updated: applicable.length,
      skipped: selected.length - applicable.length,
      markupPercent: comparison.markupPercent,
    }
  }
}
