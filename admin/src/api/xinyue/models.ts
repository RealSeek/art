import request from '@/utils/http'
import type {
  DiscoveredModel,
  ModelPreset,
  ModelProviderRoute,
  ModelVendor,
  Provider,
  ProviderTemplate
} from './types'

export type {
  DiscoveredModel,
  ModelPreset,
  ModelProviderRoute,
  ModelVendor,
  NativeSearchProvider,
  Provider,
  ProviderTemplate,
  ProviderType
} from './types'

export const modelApi = {
  providers: () => request.get<Provider[]>({ url: '/v1/admin/providers' }),
  modelVendors: () => request.get<ModelVendor[]>({ url: '/v1/admin/model-vendors' }),
  saveModelVendor: (data: Record<string, unknown>, id?: string) =>
    request.request<ModelVendor>({
      url: id ? `/v1/admin/model-vendors/${id}` : '/v1/admin/model-vendors',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteModelVendor: (id: string) =>
    request.del({ url: `/v1/admin/model-vendors/${id}`, showSuccessMessage: true }),
  providerTemplates: () => request.get<ProviderTemplate[]>({ url: '/v1/admin/provider-templates' }),
  saveProviderTemplate: (data: Record<string, unknown>, id?: string) =>
    request.request<ProviderTemplate>({
      url: id ? `/v1/admin/provider-templates/${id}` : '/v1/admin/provider-templates',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteProviderTemplate: (id: string) =>
    request.del({ url: `/v1/admin/provider-templates/${id}`, showSuccessMessage: true }),
  saveProvider: (data: Record<string, unknown>, id?: string) =>
    request.request<Provider>({
      url: id ? `/v1/admin/providers/${id}` : '/v1/admin/providers',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteProvider: (id: string) =>
    request.del({ url: `/v1/admin/providers/${id}`, showSuccessMessage: true }),
  discoverProvider: (id: string) =>
    request.post<{ models: string[]; candidates: DiscoveredModel[]; latencyMs: number }>({
      url: `/v1/admin/providers/${id}/discover-models`,
      params: {}
    }),
  importProviderModels: (
    id: string,
    data: {
      modelIds?: string[]
      importAll?: boolean
      markupPercent?: number
      overwritePricing?: boolean
    }
  ) =>
    request.post<{ discovered: number; selected: number; imported: number }>({
      url: `/v1/admin/providers/${id}/import-models`,
      data,
      showSuccessMessage: true
    }),
  checkProviders: () =>
    request.post<{ checked: number; healthy: number; unhealthy: number }>({
      url: '/v1/admin/providers/check-all',
      params: {}
    }),
  models: () => request.get<ModelPreset[]>({ url: '/v1/admin/model-presets' }),
  saveModel: (data: Record<string, unknown>, id?: string) =>
    request.request<ModelPreset>({
      url: id ? `/v1/admin/model-presets/${id}` : '/v1/admin/model-presets',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  saveModelRoutes: (id: string, routes: Array<Omit<ModelProviderRoute, 'id' | 'provider'>>) =>
    request.request<ModelPreset>({
      url: `/v1/admin/model-presets/${id}/routes`,
      method: 'PUT',
      data: { routes },
      showSuccessMessage: true
    }),
  deleteModel: (id: string) =>
    request.del({ url: `/v1/admin/model-presets/${id}`, showSuccessMessage: true })
}
