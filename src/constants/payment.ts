export const PAYMENT_PROVIDER_KEYS = ['MANUAL', 'EASYPAY', 'STRIPE', 'EXTERNAL'] as const
export const PAYMENT_METHOD_KEYS = ['manual', 'alipay', 'wechat', 'card'] as const

export type PaymentProviderKey = typeof PAYMENT_PROVIDER_KEYS[number]
export type PaymentMethodKey = typeof PAYMENT_METHOD_KEYS[number]

export const paymentProviderText: Record<PaymentProviderKey, string> = {
  MANUAL: '线下收款',
  EASYPAY: '易支付聚合',
  STRIPE: 'Stripe Checkout',
  EXTERNAL: '外部收银台',
}

export const paymentProviderDescription: Record<PaymentProviderKey, string> = {
  MANUAL: '转账后由管理员确认到账',
  EASYPAY: '接入兼容易支付协议的聚合网关',
  STRIPE: '银行卡与国际支付收银台',
  EXTERNAL: '跳转到自有或第三方 HMAC 收银台',
}

export const paymentMethodText: Record<PaymentMethodKey, string> = {
  manual: '线下支付',
  alipay: '支付宝',
  wechat: '微信支付',
  card: '银行卡',
}

export const paymentMethodsByProvider: Record<PaymentProviderKey, readonly PaymentMethodKey[]> = {
  MANUAL: ['manual'],
  EASYPAY: ['alipay', 'wechat'],
  STRIPE: ['card', 'alipay', 'wechat'],
  EXTERNAL: ['alipay', 'wechat', 'card'],
}
