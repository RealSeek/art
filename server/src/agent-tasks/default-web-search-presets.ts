import { Prisma, WebSearchProviderType } from '@prisma/client'

export const defaultWebSearchPresets = [
  {
    id: 'xinyue_search_searxng', name: 'SearXNG（自托管）', type: WebSearchProviderType.SEARXNG,
    endpoint: '', enabled: false, priority: 100, timeoutMs: 30000, maxResults: 8,
    documentationUrl: 'https://docs.searxng.org/admin/installation-docker.html',
  },
  {
    id: 'xinyue_search_tavily', name: 'Tavily Search', type: WebSearchProviderType.TAVILY,
    endpoint: 'https://api.tavily.com/search', enabled: false, priority: 90, timeoutMs: 30000, maxResults: 8,
    documentationUrl: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
  },
  {
    id: 'xinyue_search_serper', name: 'Google Serper', type: WebSearchProviderType.SERPER,
    endpoint: 'https://google.serper.dev/search', enabled: false, priority: 80, timeoutMs: 30000, maxResults: 8,
    documentationUrl: 'https://serper.dev/',
  },
  {
    id: 'xinyue_search_brave', name: 'Brave Search', type: WebSearchProviderType.BRAVE,
    endpoint: 'https://api.search.brave.com/res/v1/web/search', enabled: false, priority: 70, timeoutMs: 30000, maxResults: 8,
    documentationUrl: 'https://api-dashboard.search.brave.com/app/documentation/web-search/get-started',
  },
  {
    id: 'xinyue_search_exa', name: 'Exa Search', type: WebSearchProviderType.EXA,
    endpoint: 'https://api.exa.ai/search', enabled: false, priority: 60, timeoutMs: 30000, maxResults: 8,
    documentationUrl: 'https://docs.exa.ai/reference/search',
  },
] as const

export function webSearchPresetData(preset: typeof defaultWebSearchPresets[number]): Prisma.WebSearchChannelCreateManyInput {
  return {
    id: preset.id,
    name: preset.name,
    type: preset.type,
    endpoint: preset.endpoint,
    encryptedApiKey: '',
    apiKeyHint: '',
    enabled: preset.enabled,
    priority: preset.priority,
    timeoutMs: preset.timeoutMs,
    maxResults: preset.maxResults,
    config: { presetKey: preset.id, documentationUrl: preset.documentationUrl },
  }
}
