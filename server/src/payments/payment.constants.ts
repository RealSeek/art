export const PAYMENT_PROVIDERS = ['MANUAL', 'EASYPAY', 'STRIPE', 'EXTERNAL'] as const
export const PAYMENT_METHODS = ['manual', 'alipay', 'wechat', 'card'] as const

export type PaymentProvider = typeof PAYMENT_PROVIDERS[number]
export type PaymentMethod = typeof PAYMENT_METHODS[number]

export const PAYMENT_METHODS_BY_PROVIDER: Record<PaymentProvider, readonly PaymentMethod[]> = {
  MANUAL: ['manual'],
  EASYPAY: ['alipay', 'wechat'],
  STRIPE: ['card', 'alipay', 'wechat'],
  EXTERNAL: ['alipay', 'wechat', 'card'],
}
