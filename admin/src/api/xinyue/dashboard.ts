import request from '@/utils/http'
import type { Overview, UsageReport } from './types'

export type { Overview, UsageReport } from './types'

export const dashboardApi = {
  overview: () => request.get<Overview>({ url: '/v1/admin/overview' }),
  usageReport: (days = 30) =>
    request.get<UsageReport>({ url: '/v1/admin/usage-report', params: { days } })
}
