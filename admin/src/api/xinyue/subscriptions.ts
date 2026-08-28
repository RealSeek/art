import request from '@/utils/http'
import type {
  CouponTemplate,
  PromotionCampaign,
  SubscriptionOrder,
  SubscriptionPlan,
  UserSubscription
} from './types'

export type {
  CouponTemplate,
  PromotionCampaign,
  SubscriptionOrder,
  SubscriptionPlan,
  UserSubscription
} from './types'

export const subscriptionApi = {
  plans: () => request.get<SubscriptionPlan[]>({ url: '/v1/admin/subscriptions/plans' }),
  savePlan: (data: Record<string, unknown>, id?: string) =>
    request.request<SubscriptionPlan>({
      url: id ? `/v1/admin/subscriptions/plans/${id}` : '/v1/admin/subscriptions/plans',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deletePlan: (id: string) =>
    request.del({ url: `/v1/admin/subscriptions/plans/${id}`, showSuccessMessage: true }),
  subscriptions: () => request.get<UserSubscription[]>({ url: '/v1/admin/subscriptions/active' }),
  subscriptionOrders: () =>
    request.get<SubscriptionOrder[]>({ url: '/v1/admin/subscriptions/orders' }),
  grantSubscription: (data: { userId: string; planId: string; days?: number }) =>
    request.post({ url: '/v1/admin/subscriptions/grant', data, showSuccessMessage: true }),
  terminateSubscription: (id: string) =>
    request.post({
      url: `/v1/admin/subscriptions/${id}/terminate`,
      params: {},
      showSuccessMessage: true
    }),
  markSubscriptionPaid: (id: string) =>
    request.post({
      url: `/v1/admin/subscriptions/orders/${id}/mark-paid`,
      params: {},
      showSuccessMessage: true
    }),
  cancelSubscriptionOrder: (id: string) =>
    request.post({
      url: `/v1/admin/subscriptions/orders/${id}/cancel`,
      params: {},
      showSuccessMessage: true
    }),
  promotions: () => request.get<PromotionCampaign[]>({ url: '/v1/admin/commerce/promotions' }),
  savePromotion: (data: Record<string, unknown>, id?: string) =>
    request.request<PromotionCampaign>({
      url: id ? `/v1/admin/commerce/promotions/${id}` : '/v1/admin/commerce/promotions',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deletePromotion: (id: string) =>
    request.del({ url: `/v1/admin/commerce/promotions/${id}`, showSuccessMessage: true }),
  couponTemplates: () =>
    request.get<CouponTemplate[]>({ url: '/v1/admin/commerce/coupon-templates' }),
  saveCouponTemplate: (data: Record<string, unknown>, id?: string) =>
    request.request<CouponTemplate>({
      url: id ? `/v1/admin/commerce/coupon-templates/${id}` : '/v1/admin/commerce/coupon-templates',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteCouponTemplate: (id: string) =>
    request.del({ url: `/v1/admin/commerce/coupon-templates/${id}`, showSuccessMessage: true }),
  grantCoupon: (data: { userId: string; templateId: string }) =>
    request.post({ url: '/v1/admin/commerce/coupons/grant', data, showSuccessMessage: true })
}
