import request from '@/utils/http'
import type { AdminPublishedWork, AdminWorkReport, ContentPage } from './types'

export type { AdminPublishedWork, AdminWorkReport, ContentPage } from './types'

export const contentApi = {
  contentPages: (params?: Record<string, string | number>) =>
    request.get<{ items: ContentPage[]; total: number; page: number; pageSize: number }>({
      url: '/v1/admin/content-pages',
      params
    }),
  contentPage: (id: string) => request.get<ContentPage>({ url: `/v1/admin/content-pages/${id}` }),
  saveContentPage: (data: Record<string, unknown>, id?: string) =>
    request.request<ContentPage>({
      url: id ? `/v1/admin/content-pages/${id}` : '/v1/admin/content-pages',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteContentPage: (id: string) =>
    request.del({ url: `/v1/admin/content-pages/${id}`, showSuccessMessage: true }),
  works: (params?: Record<string, string>) =>
    request.get<AdminPublishedWork[]>({ url: '/v1/admin/works', params }),
  reviewWork: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reason?: string }) =>
    request.post<AdminPublishedWork>({
      url: `/v1/admin/works/${id}/review`,
      data,
      showSuccessMessage: true
    }),
  featureWork: (id: string, featured: boolean) =>
    request.request({
      url: `/v1/admin/works/${id}/feature`,
      method: 'PATCH',
      data: { featured },
      showSuccessMessage: true
    }),
  takeDownWork: (id: string, reason: string) =>
    request.post({
      url: `/v1/admin/works/${id}/take-down`,
      data: { reason },
      showSuccessMessage: true
    }),
  workReports: (status?: string) =>
    request.get<AdminWorkReport[]>({
      url: '/v1/admin/works/reports/list',
      params: status ? { status } : undefined
    }),
  resolveWorkReport: (id: string, data: { status: 'RESOLVED' | 'DISMISSED'; resolution: string }) =>
    request.post({ url: `/v1/admin/works/reports/${id}/resolve`, data, showSuccessMessage: true })
}
