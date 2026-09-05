/**
 * 模型厂商识别与徽标元数据。
 * 供 ModelCatalogPicker / ModelBadge / 消息头部等共用，避免各处重复正则。
 * 颜色全部引用 tokens.css 中的 --studio-vendor-* 变量，不在此处硬编码色值。
 */

export interface VendorInfo {
  key: string
  label: string
}

export interface VendorLike {
  vendor?: { key?: string; name?: string } | null
  provider?: { key?: string; name?: string; type?: string } | null
  displayName?: string
  upstreamModel?: string | null
}

/** 有专用品牌色 token（--studio-vendor-{key}）的厂商 */
const KNOWN_VENDOR_KEYS = new Set([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'qwen',
  'doubao',
  'kimi',
])

export function inferVendor(item: VendorLike): VendorInfo {
  if (item.vendor?.name) return { key: item.vendor.key || item.vendor.name, label: item.vendor.name }
  const value = `${item.displayName || ''} ${item.upstreamModel || ''}`.toLowerCase()
  if (/gpt|openai|o\d(?:-|$)/.test(value)) return { key: 'openai', label: 'OpenAI' }
  if (/deepseek/.test(value)) return { key: 'deepseek', label: 'DeepSeek' }
  if (/grok|xai/.test(value)) return { key: 'xai', label: 'xAI' }
  if (/claude|anthropic/.test(value)) return { key: 'anthropic', label: 'Anthropic' }
  if (/gemini|google/.test(value)) return { key: 'google', label: 'Google' }
  if (/qwen|通义|千问/.test(value)) return { key: 'qwen', label: '通义千问' }
  if (/doubao|豆包/.test(value)) return { key: 'doubao', label: '豆包' }
  if (/minimax|hailuo/.test(value)) return { key: 'minimax', label: 'MiniMax' }
  if (/kimi|moonshot|月之暗面/.test(value)) return { key: 'kimi', label: 'Kimi' }
  const provider = item.provider?.name || item.provider?.type
  return { key: provider || 'other', label: provider || '其他模型' }
}

/** 厂商品牌色（CSS 变量引用），未知厂商回退 default */
export function vendorColor(key: string): string {
  const normalized = key.toLowerCase()
  return `var(--studio-vendor-${KNOWN_VENDOR_KEYS.has(normalized) ? normalized : 'default'})`
}

/** 徽标首字符（无 logo 图片时的字母方案） */
export function vendorInitial(info: VendorInfo): string {
  const label = info.label.trim()
  if (!label) return '?'
  // 中文厂商名取第一个汉字，英文取首字母大写
  return label[0]!.toUpperCase()
}
