import request from '@/utils/http'
import type {
  AccountDeletionRecord,
  AdministratorRecord,
  AdminPermission,
  AdminRoleRecord,
  InvoiceRequestRecord,
  ReferralRecord,
  RenewalAttemptRecord
} from './types'

export type {
  AccountDeletionRecord,
  AdministratorRecord,
  AdminPermission,
  AdminRoleRecord,
  InvoiceRequestRecord,
  ReferralRecord,
  RenewalAttemptRecord
} from './types'

export const governanceApi = {
  adminPermissions: () => request.get<AdminPermission[]>({ url: '/v1/admin/roles/catalog' }),
  adminRoles: () => request.get<AdminRoleRecord[]>({ url: '/v1/admin/roles' }),
  administrators: () =>
    request.get<AdministratorRecord[]>({ url: '/v1/admin/roles/administrators' }),
  saveAdminRole: (data: Record<string, unknown>, id?: string) =>
    request.request<AdminRoleRecord>({
      url: id ? `/v1/admin/roles/${id}` : '/v1/admin/roles',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteAdminRole: (id: string) =>
    request.del({ url: `/v1/admin/roles/${id}`, showSuccessMessage: true }),
  assignAdminRole: (userId: string, adminRoleId: string | null) =>
    request.request({
      url: `/v1/admin/roles/administrators/${userId}`,
      method: 'PATCH',
      data: { adminRoleId },
      showSuccessMessage: true
    }),
  invoiceRequests: (status?: string) =>
    request.get<InvoiceRequestRecord[]>({
      url: '/v1/admin/invoices',
      params: status ? { status } : undefined
    }),
  reviewInvoice: (id: string) =>
    request.post({ url: `/v1/admin/invoices/${id}/review`, params: {}, showSuccessMessage: true }),
  issueInvoice: (id: string, data: { invoiceNumber: string; invoiceUrl: string }) =>
    request.post({ url: `/v1/admin/invoices/${id}/issue`, data, showSuccessMessage: true }),
  rejectInvoice: (id: string, reason: string) =>
    request.post({
      url: `/v1/admin/invoices/${id}/reject`,
      data: { reason },
      showSuccessMessage: true
    }),
  accountDeletions: (status?: string) =>
    request.get<AccountDeletionRecord[]>({
      url: '/v1/admin/account-deletions',
      params: status ? { status } : undefined
    }),
  processAccountDeletion: (id: string) =>
    request.post({
      url: `/v1/admin/account-deletions/${id}/process`,
      params: {},
      showSuccessMessage: true
    }),
  renewalAttempts: (status?: string) =>
    request.get<RenewalAttemptRecord[]>({
      url: '/v1/admin/subscriptions/renewal-attempts',
      params: status ? { status } : undefined
    }),
  retryRenewal: (id: string) =>
    request.post({
      url: `/v1/admin/subscriptions/renewal-attempts/${id}/retry`,
      params: {},
      showSuccessMessage: true
    }),
  referrals: (status?: string) =>
    request.get<ReferralRecord[]>({
      url: '/v1/admin/referrals',
      params: status ? { status } : undefined
    }),
  approveReferral: (id: string, releaseNow = false) =>
    request.post({
      url: `/v1/admin/referrals/${id}/approve`,
      data: { releaseNow },
      showSuccessMessage: true
    }),
  rejectReferral: (id: string, reason: string) =>
    request.post({
      url: `/v1/admin/referrals/${id}/reject`,
      data: { reason },
      showSuccessMessage: true
    })
}
