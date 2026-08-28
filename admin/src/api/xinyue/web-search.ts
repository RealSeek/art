import request from '@/utils/http'

export type WebSearchRow = Record<string, any>

export const webSearchApi = {
  channels: () => request.get<WebSearchRow[]>({ url: '/v1/admin/web-search-channels' }),
  tgmeng: () => request.get<WebSearchRow>({ url: '/v1/admin/web-search-channels/tgmeng' }),
  dailyHot: () => request.get<WebSearchRow>({ url: '/v1/admin/web-search-channels/dailyhot' }),
  saveDailyHot: (data: WebSearchRow) =>
    request.request<WebSearchRow>({
      url: '/v1/admin/web-search-channels/dailyhot',
      method: 'PUT',
      data,
      showSuccessMessage: true
    }),
  checkDailyHot: () =>
    request.post({
      url: '/v1/admin/web-search-channels/dailyhot/check',
      params: {},
      showSuccessMessage: true
    }),
  refreshDailyHot: () =>
    request.post({
      url: '/v1/admin/web-search-channels/dailyhot/refresh',
      params: {},
      showSuccessMessage: true
    }),
  saveTgmeng: (data: WebSearchRow) =>
    request.request<WebSearchRow>({
      url: '/v1/admin/web-search-channels/tgmeng',
      method: 'PUT',
      data,
      showSuccessMessage: true
    }),
  checkTgmeng: () =>
    request.post({
      url: '/v1/admin/web-search-channels/tgmeng/check',
      params: {},
      showSuccessMessage: true
    }),
  refreshTgmeng: () =>
    request.post({
      url: '/v1/admin/web-search-channels/tgmeng/refresh',
      params: {},
      showSuccessMessage: true
    }),
  saveChannel: (data: WebSearchRow, id?: string) =>
    request.request({
      url: id ? `/v1/admin/web-search-channels/${id}` : '/v1/admin/web-search-channels',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  checkChannel: (id: string) =>
    request.post({
      url: `/v1/admin/web-search-channels/${id}/check`,
      params: {},
      showSuccessMessage: true
    }),
  checkAll: () =>
    request.post<WebSearchRow>({ url: '/v1/admin/web-search-channels/check-all', params: {} }),
  removeChannel: (id: string) =>
    request.del({ url: `/v1/admin/web-search-channels/${id}`, showSuccessMessage: true })
}
