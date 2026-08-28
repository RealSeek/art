import request from '@/utils/http'
import type {
  PaymentChannel,
  PaymentReconciliation,
  PaymentSummary,
  PaymentTransaction,
  RechargePackage,
  RedemptionCode
} from './types'

export type {
  PaymentChannel,
  PaymentReconciliation,
  PaymentSummary,
  PaymentTransaction,
  RechargePackage,
  RedemptionCode
} from './types'

export const commerceApi = {
  rechargePackages: () => request.get<RechargePackage[]>({ url: '/v1/admin/recharge-packages' }),
  saveRechargePackage: (data: Record<string, unknown>, id?: string) =>
    request.request<RechargePackage>({
      url: id ? `/v1/admin/recharge-packages/${id}` : '/v1/admin/recharge-packages',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteRechargePackage: (id: string) =>
    request.del({ url: `/v1/admin/recharge-packages/${id}`, showSuccessMessage: true }),
  paymentChannels: () => request.get<PaymentChannel[]>({ url: '/v1/admin/payments/channels' }),
  paymentSummary: () => request.get<PaymentSummary>({ url: '/v1/admin/payments/summary' }),
  paymentReconciliation: () =>
    request.get<PaymentReconciliation>({ url: '/v1/admin/payments/reconciliation' }),
  savePaymentChannel: (data: Record<string, unknown>, id?: string) =>
    request.request<PaymentChannel>({
      url: id ? `/v1/admin/payments/channels/${id}` : '/v1/admin/payments/channels',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deletePaymentChannel: (id: string) =>
    request.del({ url: `/v1/admin/payments/channels/${id}`, showSuccessMessage: true }),
  checkPaymentChannel: (id: string) =>
    request.post<PaymentChannel>({
      url: `/v1/admin/payments/channels/${id}/check`,
      params: {},
      showSuccessMessage: true
    }),
  paymentTransactions: (params?: Record<string, string>) =>
    request.get<PaymentTransaction[]>({ url: '/v1/admin/payments/transactions', params }),
  completePayment: (id: string) =>
    request.post({
      url: `/v1/admin/payments/transactions/${id}/complete`,
      params: {},
      showSuccessMessage: true
    }),
  redemptionCodes: () => request.get<RedemptionCode[]>({ url: '/v1/admin/redemption-codes' }),
  createRedemptionCode: (data: Record<string, unknown>) =>
    request.post<RedemptionCode & { plainCode: string }>({
      url: '/v1/admin/redemption-codes',
      data
    }),
  setRedemptionCodeStatus: (id: string, enabled: boolean) =>
    request.request({
      url: `/v1/admin/redemption-codes/${id}/status`,
      method: 'PATCH',
      data: { enabled },
      showSuccessMessage: true
    })
}
