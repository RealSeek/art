import type { CatalogModel } from './model-catalog'

export function videoModelVariant(model: CatalogModel) {
  if (model.capability !== 'VIDEO') return undefined
  const match = (model.upstreamModel || model.displayName).trim().match(/^(\[c\])?\s*minimax\s*h3[-\s]+(480p|720p|2k)(?:[-\s]+(pro))?$/i)
  if (!match) return undefined
  const prefix = match[1] ? '[C]' : ''
  const quality = `${match[2].toLowerCase() === '2k' ? '2K' : match[2].toLowerCase()}${match[3] ? ' Pro' : ''}`
  return { family: `${model.source || 'PLATFORM'}:${prefix}MiniMaxH3`, label: `${prefix}MiniMax H3`, quality }
}

export function videoModelVariants(models: CatalogModel[], selectedKey: string) {
  const selected = models.find(model => model.key === selectedKey)
  const variant = selected && videoModelVariant(selected)
  if (!variant) return []
  return models.filter(model => videoModelVariant(model)?.family === variant.family && model.enabled !== false && model.availability !== 'UNCONFIGURED')
    .sort((a, b) => ['480p', '720p', '2K', '2K Pro'].indexOf(videoModelVariant(a)!.quality) - ['480p', '720p', '2K', '2K Pro'].indexOf(videoModelVariant(b)!.quality))
}

export function groupVideoModels(models: CatalogModel[], selectedKey: string) {
  const seen = new Set<string>()
  return models.flatMap(model => {
    const variant = videoModelVariant(model)
    if (!variant) return [model]
    if (seen.has(variant.family)) return []
    seen.add(variant.family)
    const variants = videoModelVariants(models, model.key)
    const representative = variants.find(item => item.key === selectedKey) || variants.find(item => item.isDefault) || variants[0] || model
    return [{ ...representative, displayName: variant.label }]
  })
}
