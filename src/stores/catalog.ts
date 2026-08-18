import { defineStore } from 'pinia'
import { api } from '../services/api'

export interface PublicCatalogSettings {
  siteName: string
  sidebarCreationEnabled: boolean
  sidebarCommerceEnabled: boolean
  sidebarOfficeEnabled: boolean
  sidebarPromptsEnabled: boolean
  sidebarPluginsEnabled: boolean
  sidebarProjectsEnabled: boolean
  sidebarAssetsEnabled: boolean
  chatUiPreset: 'gpt' | 'doubao' | 'qianwen' | 'kimi'
  chatHomeContent: ChatHomeContent
  siteContent: SiteContent
  registrationEnabled: boolean
  emailLoginEnabled: boolean
  emailVerifyEnabled: boolean
  passwordLoginEnabled: boolean
  passwordRegistrationEnabled: boolean
  linuxDoLoginEnabled: boolean
  linuxDoLoginReady: boolean
  smtpReady: boolean
  otpResendSeconds: number
  userByokEnabled: boolean
  rechargeEnabled: boolean
  subscriptionsEnabled: boolean
  trialEnabled: boolean
  currency: string
}

export type LandingContent = {
  heroLead: string
  modes: Array<{ key: string; title: string; path: string; image: string; imageAlt: string; lead: string; description: string; actions: Array<{ label: string; to: string }> }>
  navGroups: Array<{ key: string; label: string; items: Array<{ label: string; description: string; to: string }> }>
  previewNav: string[]
  trustTitle: string
  trustDescription: string
  trustItems: Array<{ title: string; description: string }>
  linksTitle: string
  linksDescription: string
  capabilityLinks: Array<{ title: string; description: string; to: string }>
  faqTitle: string
  faqs: Array<{ question: string; answer: string }>
  finalTitle: string
  finalDescription: string
  footerDescription: string
  copyright: string
}
export type SiteContent = { landing?: Partial<LandingContent> }

export type ChatUiPreset = 'gpt' | 'doubao' | 'qianwen' | 'kimi'
export type ChatQuickAction = {
  id: string
  label: string
  icon: string
  placement: 'BAR' | 'MORE'
  actionType: 'PROMPT' | 'OFFICE' | 'ROUTE'
  prompt: string
  target: string
  modelKey: string
  webSearch: boolean
  enabled: boolean
  sortOrder: number
}
export type ChatComposerControls = {
  modeEnabled: boolean
  webSearchEnabled: boolean
  modelSelectorEnabled: boolean
  moreEnabled: boolean
}

export interface ChatHomeContent {
  doubaoRecommendations: Array<{ title: string; prompt: string; targetUrl?: string }>
  qianwenBanners: Array<{ title: string; description: string; buttonText: string; imageUrl: string; targetUrl: string }>
  kimiProject: { label: string; targetUrl: string }
  composerControls: Record<ChatUiPreset, ChatComposerControls>
  quickActions: Record<ChatUiPreset, ChatQuickAction[]>
}
type RecommendationResponse = { enabled?: boolean; items?: Array<{ title: string; prompt: string; targetUrl?: string }> }

const defaultChatHomeContent: ChatHomeContent = {
  doubaoRecommendations: [],
  qianwenBanners: [
    { title: 'Xinyue 办公助理上线', description: '解锁本地任务能力，多格式交付', buttonText: '立即体验', imageUrl: '', targetUrl: '/office' },
    { title: '多格式办公文件交付', description: '生成可继续编辑的 PPTX、DOCX 与 XLSX 文件', buttonText: '开始办公任务', imageUrl: '', targetUrl: '/office' },
    { title: '会议材料整理', description: '根据会议文字或文档提炼议题、结论与待办', buttonText: '整理会议材料', imageUrl: '', targetUrl: '/office?tool=meeting' },
  ],
  kimiProject: { label: '选择项目', targetUrl: '/workspace?tab=projects' },
  composerControls: {
    gpt: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: false },
    doubao: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    qianwen: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
    kimi: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
  },
  quickActions: {
    gpt: [],
    doubao: [
      { id: 'doubao-video', label: '视频生成', icon: 'video', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/video', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'doubao-music', label: '音乐创作方案', icon: 'music', placement: 'BAR', actionType: 'PROMPT', prompt: '请根据以下描述策划音乐风格、结构、歌词方向与制作方案：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'doubao-image', label: '图像生成', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'doubao-podcast', label: 'AI 播客', icon: 'podcast', placement: 'BAR', actionType: 'PROMPT', prompt: '请策划一份 AI 播客脚本：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'doubao-table', label: 'AI 表格', icon: 'table', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'spreadsheet', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
      { id: 'doubao-writing', label: '帮我写作', icon: 'writing', placement: 'BAR', actionType: 'OFFICE', prompt: '请帮我撰写：', target: 'writing', modelKey: '', webSearch: false, enabled: true, sortOrder: 60 },
      { id: 'doubao-transcribe', label: '会议纪要', icon: 'transcribe', placement: 'BAR', actionType: 'OFFICE', prompt: '请根据我提供的会议文字或文档整理会议纪要：', target: 'meeting', modelKey: '', webSearch: false, enabled: true, sortOrder: 70 },
      { id: 'doubao-ppt', label: 'PPT 生成', icon: 'ppt', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'doubao-translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译以下内容：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'doubao-research', label: '深入研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', webSearch: true, enabled: true, sortOrder: 30 },
      { id: 'doubao-answer', label: '解题答疑', icon: 'answer', placement: 'MORE', actionType: 'PROMPT', prompt: '请分步解答以下问题：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'doubao-analysis', label: '数据分析', icon: 'table', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'analysis', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
    ],
    qianwen: [
      { id: 'qianwen-office', label: '办公助理', icon: 'office', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'daily', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'qianwen-ppt', label: 'PPT 创作', icon: 'ppt', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'qianwen-video', label: 'AI 生视频', icon: 'video', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/video', modelKey: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'qianwen-image', label: 'AI 生图', icon: 'image', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'qianwen-code', label: '代码', icon: 'code', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'development', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'qianwen-translate', label: '翻译', icon: 'translate', placement: 'MORE', actionType: 'PROMPT', prompt: '请准确翻译以下内容：', target: '', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'qianwen-writing', label: 'AI 写作', icon: 'writing', placement: 'MORE', actionType: 'OFFICE', prompt: '', target: 'writing', modelKey: '', webSearch: false, enabled: true, sortOrder: 30 },
      { id: 'qianwen-research', label: '研究', icon: 'research', placement: 'MORE', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', webSearch: true, enabled: true, sortOrder: 40 },
      { id: 'qianwen-meeting', label: '会议纪要', icon: 'transcribe', placement: 'MORE', actionType: 'OFFICE', prompt: '请根据我提供的会议文字或文档整理会议纪要：', target: 'meeting', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
    ],
    kimi: [
      { id: 'kimi-ppt', label: 'PPT', icon: 'ppt', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'ppt', modelKey: '', webSearch: false, enabled: true, sortOrder: 10 },
      { id: 'kimi-agent', label: '集群', icon: 'office', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'daily', modelKey: '', webSearch: false, enabled: true, sortOrder: 20 },
      { id: 'kimi-research', label: '深度研究', icon: 'research', placement: 'BAR', actionType: 'PROMPT', prompt: '请深入研究并给出可核验的资料来源：', target: '', modelKey: '', webSearch: true, enabled: true, sortOrder: 30 },
      { id: 'kimi-document', label: '文档', icon: 'document', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'report', modelKey: '', webSearch: false, enabled: true, sortOrder: 40 },
      { id: 'kimi-website', label: '网站', icon: 'website', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'development', modelKey: '', webSearch: false, enabled: true, sortOrder: 50 },
      { id: 'kimi-table', label: '表格', icon: 'table', placement: 'BAR', actionType: 'OFFICE', prompt: '', target: 'spreadsheet', modelKey: '', webSearch: false, enabled: true, sortOrder: 60 },
      { id: 'kimi-design', label: '设计', icon: 'design', placement: 'BAR', actionType: 'ROUTE', prompt: '', target: '/image', modelKey: '', webSearch: false, enabled: true, sortOrder: 70 },
    ],
  },
}

const emptySettings: PublicCatalogSettings = {
  siteName: 'Xinyue AI',
  sidebarCreationEnabled: true,
  sidebarCommerceEnabled: true,
  sidebarOfficeEnabled: true,
  sidebarPromptsEnabled: true,
  sidebarPluginsEnabled: true,
  sidebarProjectsEnabled: true,
  sidebarAssetsEnabled: true,
  chatUiPreset: 'gpt',
  chatHomeContent: defaultChatHomeContent,
  siteContent: {},
  registrationEnabled: false,
  emailLoginEnabled: false,
  emailVerifyEnabled: false,
  passwordLoginEnabled: false,
  passwordRegistrationEnabled: false,
  linuxDoLoginEnabled: false,
  linuxDoLoginReady: false,
  smtpReady: false,
  otpResendSeconds: 60,
  userByokEnabled: false,
  rechargeEnabled: false,
  subscriptionsEnabled: false,
  trialEnabled: false,
  currency: 'CNY',
}

let pendingLoad: Promise<Partial<PublicCatalogSettings>> | null = null
let refreshTimer = 0

export const useCatalogStore = defineStore('catalog', {
  state: () => ({ settings: { ...emptySettings } as PublicCatalogSettings, loaded: false, loading: false }),
  getters: {
    registrationEnabled: (state) => state.loaded && state.settings.registrationEnabled,
    emailLoginEnabled: (state) => state.loaded && state.settings.emailLoginEnabled,
    emailVerifyEnabled: (state) => state.loaded && state.settings.emailVerifyEnabled,
    passwordLoginEnabled: (state) => state.loaded && state.settings.passwordLoginEnabled,
    passwordRegistrationEnabled: (state) => state.loaded && state.settings.passwordRegistrationEnabled,
    linuxDoLoginEnabled: (state) => state.loaded && state.settings.linuxDoLoginEnabled,
    linuxDoLoginReady: (state) => state.loaded && state.settings.linuxDoLoginReady,
    loginEnabled: (state) => state.loaded && (state.settings.passwordLoginEnabled || state.settings.emailLoginEnabled || state.settings.emailVerifyEnabled || state.settings.linuxDoLoginReady),
    registrationAvailable: (state) => state.loaded && state.settings.registrationEnabled && (state.settings.passwordRegistrationEnabled || state.settings.emailVerifyEnabled || state.settings.linuxDoLoginReady),
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.settings
      this.loading = true
      try {
        pendingLoad ||= api<Partial<PublicCatalogSettings>>('/catalog/settings')
        const settings = await pendingLoad
        const content: Partial<ChatHomeContent> = settings.chatHomeContent || {}
        const rawKimiProject = content.kimiProject
        this.settings = {
          ...emptySettings,
          ...settings,
          chatHomeContent: {
            ...defaultChatHomeContent,
            ...content,
            doubaoRecommendations: Array.isArray(content.doubaoRecommendations) ? content.doubaoRecommendations : defaultChatHomeContent.doubaoRecommendations,
            qianwenBanners: Array.isArray(content.qianwenBanners) ? content.qianwenBanners : defaultChatHomeContent.qianwenBanners,
            kimiProject: rawKimiProject && typeof rawKimiProject === 'object' ? { ...defaultChatHomeContent.kimiProject, ...rawKimiProject } : defaultChatHomeContent.kimiProject,
            composerControls: {
              ...structuredClone(defaultChatHomeContent.composerControls),
              ...(content.composerControls || {}),
            },
            quickActions: {
              ...structuredClone(defaultChatHomeContent.quickActions),
              ...(content.quickActions || {}),
            },
          }
        }
        void this.refreshRecommendations()
      } catch {
        if (!this.loaded) this.settings = { ...emptySettings }
      } finally {
        pendingLoad = null
        this.loaded = true
        this.loading = false
        if (typeof window !== 'undefined') {
          window.clearTimeout(refreshTimer)
          refreshTimer = window.setTimeout(() => void this.load(true), document.hidden ? 300_000 : 60_000)
        }
      }
      return this.settings
    },
    async refreshRecommendations() {
      const result = await api<RecommendationResponse>('/catalog/recommendations').catch(() => ({ items: [] }))
      const items = Array.isArray(result.items) ? result.items.filter((item) => item && typeof item.title === 'string' && item.title.trim()) : []
      if (items.length) this.settings.chatHomeContent.doubaoRecommendations = items
    },
  },
})
