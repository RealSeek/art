import type { AvailableModel, ProviderType } from './types'

export const moderationSourceText: Record<string, string> = { CHAT: '对话', IMAGE: '图片生成', COMMERCE: '商品视觉', FILE_NAME: '文件', SUPPORT: '客服' }
export const providerTypeLabel: Record<ProviderType, string> = { OPENAI: 'OpenAI', NEW_API: 'OnlyCode', SUB2API: 'Sub2API', OPENAI_COMPATIBLE: 'OpenAI 兼容' }
export const routingStrategyLabel: Record<string, string> = { PRIORITY: '优先级', WEIGHTED: '权重分流', ROUND_ROBIN: '轮询' }
export const modelCapabilityLabel: Record<AvailableModel['capability'], string> = { CHAT: '对话', IMAGE: '图片', VIDEO: '视频', COMMERCE: '商品图' }
export const teamRoleText: Record<string, string> = { OWNER: '所有者', ADMIN: '管理员', MEMBER: '成员' }
