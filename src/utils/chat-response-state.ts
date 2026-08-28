import type { Message } from '../types'

export type ChatResponsePhase = 'thinking' | 'search' | 'reasoning' | 'answer' | 'done'

export interface ChatResponseActivity {
  isGenerating: boolean
  activeJobId: string
}

export interface ChatResponseState {
  phase: ChatResponsePhase
  isStreaming: boolean
  isPending: boolean
  shouldRender: boolean
  hasProcess: boolean
  isProcessRunning: boolean
  processTitle: string
  processStatus: '实时更新' | '部分完成' | '已完成'
  reasoningSummary: string
}

export function summarizeChatReasoning(reasoning?: string) {
  const value = reasoning?.replace(/\s+/g, ' ').trim() || ''
  if (!value) return ''
  if (/planning.*answer.*citation/i.test(value)) return '已规划中文回答结构，并安排资料引用'
  if (/planning|outlin/i.test(value) && value.length < 180) return '已分析问题并规划回答结构'
  if (/analy[sz]|reasoning/i.test(value) && value.length < 180) return '已完成问题分析和关键信息梳理'
  if (/^[\x00-\x7F]+$/.test(value) && value.length < 180) return '已完成问题分析与回答组织'
  return value.length > 320 ? `${value.slice(0, 320)}…` : value
}

export function resolveChatResponseState(
  message: Message,
  activity: ChatResponseActivity
): ChatResponseState {
  const isAssistant = message.role === 'assistant'
  const isStreaming = isAssistant
    && activity.isGenerating
    && Boolean(activity.activeJobId)
    && message.generationJobId === activity.activeJobId
  const reasoningSummary = summarizeChatReasoning(message.reasoning)
  const isProcessRunning = isStreaming || message.webSearch?.status === 'searching'
  const shouldRender = Boolean(message.content.trim())
  const isPending = isStreaming && !shouldRender && !message.reasoning?.trim()
  const hasProcess = Boolean(isStreaming || message.webSearch || reasoningSummary)

  let phase: ChatResponsePhase = 'done'
  if (isProcessRunning) {
    if (message.webSearch?.status === 'searching') phase = 'search'
    else if (message.reasoning?.trim()) phase = 'reasoning'
    else phase = shouldRender ? 'answer' : 'thinking'
  }

  const processTitle = message.webSearch?.status === 'searching'
    ? '正在思考与检索'
    : isStreaming
      ? message.reasoning?.trim() ? '正在组织回答' : '正在思考'
      : message.webSearch ? '思考与检索' : '思考过程'

  const processStatus = isProcessRunning
    ? '实时更新'
    : message.webSearch?.status === 'failed' ? '部分完成' : '已完成'

  return {
    phase,
    isStreaming,
    isPending,
    shouldRender,
    hasProcess,
    isProcessRunning,
    processTitle,
    processStatus,
    reasoningSummary,
  }
}
