import request from '@/utils/http'

export type Overview = {
  users: number
  newUsers: number
  activeUsers: number
  groups: number
  jobs: number
  runningJobs: number
  failedJobs: number
  assets: number
  storageBytes: number
  creditsSpent: number
  providers: number
  healthyProviders: number
  activeSubscriptions: number
  revenueCents: number
  pendingOrders: number
  trend: Array<{ date: string; newUsers: number; jobs: number; revenueCents: number }>
  today: { newUsers: number; jobs: number; revenueCents: number }
  alerts: {
    paymentFailures: number
    paidPending: number
    unhealthyChannels: number
    suspendedUsers: number
    moderationOpen: number
    supportOpen: number
    supportUrgent: number
  }
}
export type UsageReport = {
  days: number
  summary: {
    jobs: number
    credits: number
    revenueMicros: number
    costMicros: number
    marginMicros: number
    marginRate: number | null
    inputTokens: number
    outputTokens: number
    outputs: number
  }
  daily: Array<{
    date: string
    jobs: number
    credits: number
    revenueMicros: number
    costMicros: number
  }>
  models: Array<{
    key: string
    label: string
    jobs: number
    credits: number
    outputs: number
    revenueMicros: number
    costMicros: number
    marginRate: number | null
  }>
  providers: Array<{
    key: string
    label: string
    jobs: number
    credits: number
    outputs: number
    revenueMicros: number
    costMicros: number
    marginRate: number | null
  }>
}
export type PaymentSummary = {
  channels: number
  enabledChannels: number
  completed: number
  pending: number
  failed: number
  revenueCents: number
  refundedCents: number
  netRevenueCents: number
  recent: PaymentTransaction[]
}
export type PaymentReconciliation = {
  paidPending: number
  expiredPending: number
  failedRecent: number
  unprocessedWebhooks: number
  refundReviews: number
  total: number
}

export type AdminUser = {
  id: string
  username?: string | null
  email: string | null
  displayName: string
  avatarUrl?: string | null
  company?: string | null
  phone?: string | null
  tags?: string[]
  adminNote?: string | null
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
  lastLoginAt?: string | null
  creditAccount?: { balance: number } | null
  groupMemberships: Array<{ group: { id: string; name: string; color: string } }>
  subscriptions: Array<{ status: string; plan: { id: string; name: string; code: string } }>
  _count: { assets: number; jobs: number; projects: number }
}

export type AdminTeam = {
  id: string
  name: string
  slug: string
  description: string
  ownerId: string
  seatLimit: number
  status: 'ACTIVE' | 'SUSPENDED'
  billingEnabled: boolean
  createdAt: string
  updatedAt: string
  owner: { id: string; email: string | null; displayName: string }
  creditAccount?: { balance: number; updatedAt: string } | null
  members: Array<{ userId: string; role: string; monthlyCreditLimit: number | null; creditsUsed: number; creditPeriodStart: string; joinedAt: string; user: { id: string; email: string | null; displayName: string } }>
  invitations: Array<{ id: string; email: string; role: string; expiresAt: string; createdAt: string }>
  _count: { members: number; invitations: number; auditLogs: number; projects: number; assets: number; knowledgeBases: number }
}

export type AdminTeamResources = {
  projects: Array<{ id: string; name: string; workflowStatus: string; updatedAt: string; user: { displayName: string }; _count: { assets: number; conversations: number } }>
  assets: Array<{ id: string; name: string; kind: string; mimeType: string; size: number; createdAt: string; user: { displayName: string } }>
  knowledgeBases: Array<{ id: string; name: string; status: string; documentCount: number; chunkCount: number; updatedAt: string; creator: { displayName: string } }>
}

export type TeamAuditLog = {
  id: string
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown> | null
  createdAt: string
  actor?: { id: string; email: string | null; displayName: string } | null
}

export type ModelProviderRoute = {
  id?: string
  providerId: string
  upstreamModelOverride?: string | null
  enabled: boolean
  priority?: number | null
  weight?: number | null
  inputCostMicrosPerMillion?: number | null
  outputCostMicrosPerMillion?: number | null
  imageCostMicros?: number | null
  videoCostMicros?: number | null
  options?: {
    videoCapabilities?: { resolutions?: string[]; durations?: number[]; aspectRatios?: string[] }
  } | null
  provider?: Pick<Provider, 'id' | 'name' | 'type' | 'enabled' | 'priority' | 'weight'>
}

export type UserGroup = {
  id: string
  name: string
  description: string
  color: string
  enabled: boolean
  isDefault?: boolean
  restrictModels: boolean
  creditRatePercent: number
  allowUserByok: boolean
  modelAccess: Array<{ modelPresetId: string }>
  members: Array<{
    user: { id: string; email: string | null; displayName: string; status: string }
  }>
  _count: { members: number; campaigns: number; modelAccess: number }
}
export type ProviderType =
  | 'OPENAI'
  | 'NEW_API'
  | 'SUB2API'
  | 'OPENAI_COMPATIBLE'
  | 'POLLINATIONS'
  | 'LOCAL_WORKER'
export type NativeSearchProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'xai'
  | 'qwen'
  | 'doubao'
  | 'disabled'
export type ModelVendor = {
  id: string
  key: string
  name: string
  icon: string
  websiteUrl: string
  enabled: boolean
  sortOrder: number
}
export type ProviderTemplate = {
  id: string
  key: string
  name: string
  description: string
  vendorId?: string | null
  type: ProviderType
  baseUrl: string
  authType: 'BEARER' | 'X_API_KEY' | 'BOTH'
  apiProtocol: 'openai' | 'anthropic' | 'gemini'
  nativeSearchProvider: NativeSearchProvider
  customHeaders?: Record<string, string> | null
  supportsDiscovery: boolean
  enabled: boolean
  sortOrder: number
  vendor?: ModelVendor | null
  _count: { providerChannels: number; userCredentials: number }
}
export type Provider = {
  id: string
  name: string
  templateId?: string | null
  type: ProviderType
  baseUrl: string
  apiKeyHint: string
  authType: 'BEARER' | 'X_API_KEY' | 'BOTH'
  enabled: boolean
  priority: number
  weight: number
  timeoutMs: number
  allowUserKeys: boolean
  lastHealthStatus?: string
  lastHealthMessage?: string
  consecutiveFailures?: number
  metadata?: { apiProtocol?: string; nativeSearchProvider?: NativeSearchProvider } | null
  template?: Pick<ProviderTemplate, 'id' | 'name' | 'apiProtocol' | 'nativeSearchProvider'> | null
  _count: { modelPresets: number; modelRoutes: number }
}

export type DiscoveredModel = {
  id: string
  displayName: string
  vendorKey: string
  vendorName: string
  capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' | null
  importable: boolean
  confidence: 'exact' | 'inferred' | 'unknown'
  pricingSource: 'litellm' | 'fallback' | 'none'
  inputCostMicrosPerMillion: number
  outputCostMicrosPerMillion: number
  imageCostMicros: number
  videoCostMicros: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  flatCreditCost: number
  contextWindow: number | null
  maxOutputTokens: number | null
  features: string[]
  warnings: string[]
  existingPreset?: { id: string; key: string } | null
}

export type ModelPreset = {
  id: string
  key: string
  displayName: string
  description: string
  vendorId?: string | null
  providerId?: string | null
  upstreamModel: string
  capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'
  enabled: boolean
  isDefault: boolean
  allowUserKey: boolean
  sortOrder: number
  flatCreditCost: number
  inputCreditsPerMillion: number
  outputCreditsPerMillion: number
  badge: string
  options?: {
    apiProtocol?: 'openai' | 'anthropic' | 'gemini'
    nativeSearchProvider?: NativeSearchProvider
    agentEnabled?: boolean
    agentCapabilities?: {
      eligible?: boolean
      confidence?: 'confirmed' | 'compatible' | 'limited'
      supportsTools?: boolean
      supportsStructuredOutput?: boolean
      supportsReasoning?: boolean
      contextWindow?: number | null
      maxOutputTokens?: number | null
      reason?: string
    }
    discovery?: {
      source?: string
      confidence?: string
      contextWindow?: number | null
      maxOutputTokens?: number | null
      features?: string[]
      importedAt?: string
    }
    imageCapabilities?: {
      sizes?: string[]
      qualities?: string[]
      outputFormats?: string[]
      backgrounds?: string[]
      maxCount?: number
      defaultSize?: string
      defaultQuality?: string
      supportsReference?: boolean
      supportsMask?: boolean
      resolutionPricing?: Record<string, number>
    }
    videoCapabilities?: {
      resolutions?: string[]
      durations?: number[]
      aspectRatios?: string[]
      defaultResolution?: string
      defaultDuration?: number
      defaultAspectRatio?: string
      pricing?: Record<string, number>
      createPath?: string
      statusPath?: string
      contentPath?: string
      pollIntervalMs?: number
      maxPollSeconds?: number
    }
  } | null
  provider?: { id: string; name: string } | null
  vendor?: ModelVendor | null
  providerRoutes?: ModelProviderRoute[]
}

export type SubscriptionPlan = {
  id: string
  code: string
  name: string
  description: string
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME'
  priceCents: number
  originalPriceCents?: number | null
  currency: string
  includedCredits: number
  trialDays: number
  concurrency: number
  allowByok: boolean
  apiAccess: boolean
  imageAccess: boolean
  videoAccess: boolean
  commerceAccess: boolean
  batchAccess: boolean
  capabilities?: {
    canvasAccess?: boolean
    shortDramaAccess?: boolean
    maxCanvases?: number
    maxCanvasNodes?: number
    [key: string]: unknown
  } | null
  enabled: boolean
  recommended: boolean
  sortOrder: number
}
export type UserSubscription = {
  id: string
  status: string
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  user: Pick<AdminUser, 'id' | 'email' | 'displayName'>
  plan: SubscriptionPlan
}

export type AdminPermission = { code: string; name: string; group: string }
export type AdminRoleRecord = { id: string; code: string; name: string; description: string; permissions: string[]; builtIn: boolean; enabled: boolean; _count: { users: number } }
export type AdministratorRecord = { id: string; email: string | null; username: string | null; displayName: string; role: string; status: string; adminRoleId: string | null; adminRole: AdminRoleRecord | null; lastLoginAt: string | null; createdAt: string }
export type InvoiceRequestRecord = { id: string; status: string; amountCents: number; currency: string; invoiceType: string; invoiceNumber: string; invoiceUrl: string; rejectionReason: string; requestedAt: string; issuedAt: string | null; profileSnapshot: Record<string, string>; user: { id: string; displayName: string; email: string | null; company: string }; transaction: { outTradeNo: string; orderType: string; status: string; paymentMethod: string; completedAt: string | null } }
export type AccountDeletionRecord = { id: string; userId: string; status: string; reason: string; requestedAt: string; scheduledAt: string; completedAt: string | null; failureReason: string; user: { id: string; email: string | null; username: string | null; displayName: string; status: string; createdAt: string } }
export type RenewalAttemptRecord = { id: string; status: string; attemptNumber: number; orderId: string | null; scheduledAt: string; completedAt: string | null; failureReason: string; subscription: { id: string; status: string; currentPeriodEnd: string | null; user: { id: string; displayName: string; email: string | null }; plan: { name: string; priceCents: number; currency: string } } }
export type ReferralRecord = {
  id: string
  code: string
  status: 'REGISTERED' | 'COOLING' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REWARDED' | 'REJECTED' | 'REVERSED'
  qualifiedAmountCents: number
  reward: number
  payableAt: string | null
  rewardedAt: string | null
  reversedAt: string | null
  reviewReason: string
  riskFlags: string[] | null
  createdAt: string
  inviter: { id: string; displayName: string; email: string | null; username: string | null; creditAccount: { balance: number } | null }
  invitee: { id: string; displayName: string; email: string | null; username: string | null; createdAt: string }
  qualifyingTransaction: { id: string; outTradeNo: string; orderType: string; amountCents: number; status: string; completedAt: string | null } | null
}
export type SubscriptionOrder = {
  id: string
  status: string
  amountCents: number
  currency: string
  paymentMethod: string
  createdAt: string
  paidAt?: string | null
  user: Pick<AdminUser, 'id' | 'email' | 'displayName'>
  plan: SubscriptionPlan
}
export type PromotionCampaign = {
  id: string
  name: string
  label: string
  enabled: boolean
  startsAt: string
  endsAt: string
  products: Array<{ campaignId: string; planId: string; promotionalPriceCents: number; plan: Pick<SubscriptionPlan, 'id' | 'name' | 'code' | 'priceCents'> }>
  _count: { orders: number }
}
export type CouponTemplate = {
  id: string
  code: string
  name: string
  description: string
  discountType: 'FIXED' | 'PERCENT'
  discountValue: number
  minimumSpendCents: number
  maximumDiscountCents?: number | null
  stackWithPromotion: boolean
  claimEnabled: boolean
  enabled: boolean
  totalLimit?: number | null
  perUserLimit: number
  validDays?: number | null
  startsAt?: string | null
  endsAt?: string | null
  issuedCount: number
  redeemedCount: number
  products: Array<{ templateId: string; planId: string; plan: Pick<SubscriptionPlan, 'id' | 'name' | 'code'> }>
  _count: { userCoupons: number }
}
export type RechargePackage = {
  id: string
  name: string
  description: string
  credits: number
  priceCents: number
  originalPriceCents?: number | null
  enabled: boolean
  recommended: boolean
  sortOrder: number
}
export type PaymentChannel = {
  id: string
  name: string
  providerKey: string
  enabled: boolean
  isDefault: boolean
  supportedMethods: string[]
  minAmountCents: number
  maxAmountCents?: number | null
  dailyLimitCents?: number | null
  feeRateBps: number
  sortOrder: number
  publicConfig?: Record<string, unknown>
  secretHints?: Record<string, string>
  lastHealthStatus: string
  lastError: string
  lastCheckedAt?: string | null
  _count?: { transactions: number }
}
export type PaymentTransaction = {
  id: string
  outTradeNo: string
  providerTradeNo?: string | null
  orderType: string
  status: string
  amountCents: number
  currency: string
  paymentMethod: string
  createdAt: string
  failureReason?: string
  user?: Pick<AdminUser, 'id' | 'email' | 'displayName'>
  channel?: { id: string; name: string; providerKey: string }
}
export type RedemptionCode = {
  id: string
  name: string
  codePrefix: string
  credits: number
  maxUses: number
  usedCount: number
  expiresAt?: string | null
  disabledAt?: string | null
  createdAt: string
}
export type ContentPage = {
  id: string
  slug: string
  title: string
  category: string
  summary: string
  contentHtml: string
  coverUrl: string
  published: boolean
  sortOrder: number
  views: number
  publishedAt?: string | null
  createdAt: string
  updatedAt: string
}
export type SystemSettings = {
  siteName: string
  siteLogoUrl: string
  supportUrl: string
  sidebarCreationEnabled: boolean
  sidebarCommerceEnabled: boolean
  sidebarOfficeEnabled: boolean
  sidebarPromptsEnabled: boolean
  sidebarPluginsEnabled: boolean
  sidebarProjectsEnabled: boolean
  sidebarAssetsEnabled: boolean
  registrationEnabled: boolean
  emailLoginEnabled: boolean
  emailVerifyEnabled: boolean
  passwordLoginEnabled: boolean
  passwordRegistrationEnabled: boolean
  linuxDoLoginEnabled: boolean
  linuxDoClientId: string
  linuxDoRedirectUrl: string
  linuxDoScopes: string
  linuxDoAuthorizeUrl: string
  linuxDoTokenUrl: string
  linuxDoUserInfoUrl: string
  hasLinuxDoClientSecret: boolean
  linuxDoClientSecretHint: string
  allowedEmailDomains: string[]
  otpTtlMinutes: number
  otpResendSeconds: number
  defaultUserCredits: number
  defaultTheme: string
  defaultLanguage: string
  chatUiPreset: 'gpt' | 'doubao' | 'qianwen' | 'kimi'
  chatHomeContent: ChatHomeContent
  quickActionRegistry: CapabilityRegistrySnapshot
  siteContent: SiteContent
  defaultChatModelKey: string
  defaultImageModelKey: string
  userByokEnabled: boolean
  inviteRewardCredits: number
  referralEnabled: boolean
  referralCoolingDays: number
  referralMinimumPaidCents: number
  referralMonthlyRewardLimit: number
  referralAutoApprove: boolean
  rechargeEnabled: boolean
  minRechargeCents: number
  currency: string
  creditValueMicros: number
  modelImportMarkupPercent: number
  modelPriceCatalogUrl: string
  modelPriceCatalogRefreshHours: number
  subscriptionsEnabled: boolean
  trialEnabled: boolean
  defaultTrialPlanId: string
  trialCredits: number
  defaultUserGroupId: string
  temporaryChatRetentionHours: number
  defaultChatHistoryEnabled: boolean
  defaultTrainingOptOut: boolean
  defaultShareUsageAnalytics: boolean
  smtpEnabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  smtpFromName: string
  smtpFromEmail: string
  hasSmtpPassword: boolean
  smtpPasswordHint: string
}
export type SiteContent = {
  landing: {
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
}
export type AdminMfaStatus = { enabled: boolean; enabledAt: string | null; recoveryCodesRemaining: number }
export type AdminMfaSetup = { ticket: string; secret: string; uri: string; qrCodeDataUrl: string; expiresIn: number }
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
export type QuickActionStatus = {
  id: string
  preset: ChatUiPreset
  handler: string
  available: boolean
  published: boolean
  reason: string
}
export type CapabilityRegistrySnapshot = {
  handlers: Array<{ id: string; actionType: ChatQuickAction['actionType']; description: string }>
  dependencies: {
    modelCapabilities: string[]
    modelKeys: string[]
    webSearchAvailable: boolean
    externalSearchAvailable: boolean
    nativeSearchAvailable: boolean
  }
  actions: QuickActionStatus[]
}
export type ChatComposerControls = {
  modeEnabled: boolean
  webSearchEnabled: boolean
  modelSelectorEnabled: boolean
  moreEnabled: boolean
}
export type ChatHomeContent = {
  doubaoRecommendations: Array<{ title: string; prompt: string; targetUrl?: string }>
  qianwenBanners: Array<{
    title: string
    description: string
    buttonText: string
    imageUrl: string
    targetUrl: string
  }>
  kimiProject: { label: string; targetUrl: string }
  composerControls: Record<ChatUiPreset, ChatComposerControls>
  quickActions: Record<ChatUiPreset, ChatQuickAction[]>
}

export type AdminWorkAsset = {
  id: string
  name: string
  kind: 'IMAGE' | 'VIDEO'
  contentUrl: string
}
export type AdminWorkVersion = {
  id: string
  versionNumber: number
  title: string
  description: string
  category: string
  tags: string[]
  publicPrompt: string
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'
  moderationStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'TAKEN_DOWN'
  rejectionReason: string
  submittedAt?: string | null
  reviewedAt?: string | null
  assets: AdminWorkAsset[]
}
export type AdminPublishedWork = {
  id: string
  slug: string
  lifecycleStatus: string
  isFeatured: boolean
  viewCount: number
  likeCount: number
  updatedAt: string
  user: { id: string; displayName: string; email: string | null }
  currentVersion: AdminWorkVersion
  publishedVersion?: AdminWorkVersion | null
  _count: { likes: number; reports: number; versions: number }
}
export type AdminWorkReport = {
  id: string
  reason: string
  details: string
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  resolution: string
  createdAt: string
  reporter: { id: string; displayName: string; email: string | null }
  work: { id: string; currentVersion?: { title: string } | null }
  resolvedBy?: { id: string; displayName: string } | null
}

export const xinyueApi = {
  overview: () => request.get<Overview>({ url: '/v1/admin/overview' }),
  usageReport: (days = 30) =>
    request.get<UsageReport>({ url: '/v1/admin/usage-report', params: { days } }),
  users: (params?: Record<string, string>) =>
    request.get<AdminUser[]>({ url: '/v1/admin/users', params }),
  user: (id: string) => request.get<AdminUser>({ url: `/v1/admin/users/${id}` }),
  updateUserProfile: (id: string, body: Record<string, unknown>) =>
    request.request<AdminUser>({
      url: `/v1/admin/users/${id}/profile`,
      method: 'PATCH',
      data: body
    }),
  updateUserGroups: (id: string, groupIds: string[]) =>
    request.request<{ groupIds: string[] }>({
      url: `/v1/admin/users/${id}/groups`,
      method: 'PATCH',
      data: { groupIds }
    }),
  revokeUserSessions: (id: string) =>
    request.post<{ revoked: number }>({
      url: `/v1/admin/users/${id}/revoke-sessions`,
      params: {},
      showSuccessMessage: true
    }),
  groups: () => request.get<UserGroup[]>({ url: '/v1/admin/groups' }),
  saveGroup: (body: Record<string, unknown>, id?: string) =>
    request.request<UserGroup>({
      url: id ? `/v1/admin/groups/${id}` : '/v1/admin/groups',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteGroup: (id: string) =>
    request.del({ url: `/v1/admin/groups/${id}`, showSuccessMessage: true }),
  setDefaultGroup: (id: string) =>
    request.post({ url: `/v1/admin/groups/${id}/default`, params: {}, showSuccessMessage: true }),
  saveGroupPolicy: (id: string, body: Record<string, unknown>) =>
    request.request({
      url: `/v1/admin/groups/${id}/policy`,
      method: 'PATCH',
      data: body,
      showSuccessMessage: true
    }),
  groupMembers: (id: string) =>
    request.get<Array<{ user: AdminUser }>>({ url: `/v1/admin/groups/${id}/members` }),
  addGroupMembers: (id: string, userIds: string[]) =>
    request.post({
      url: `/v1/admin/groups/${id}/members`,
      data: { userIds },
      showSuccessMessage: true
    }),
  removeGroupMember: (id: string, userId: string) =>
    request.del({ url: `/v1/admin/groups/${id}/members/${userId}`, showSuccessMessage: true }),
  setUserStatus: (id: string, status: AdminUser['status']) =>
    request.request({
      url: `/v1/admin/users/${id}/status`,
      method: 'PATCH',
      data: { status },
      showSuccessMessage: true
    }),
  adjustCredits: (id: string, amount: number, reason: string) =>
    request.post({
      url: `/v1/admin/users/${id}/credits`,
      params: { amount, reason },
      showSuccessMessage: true
    }),
  providers: () => request.get<Provider[]>({ url: '/v1/admin/providers' }),
  teams: () => request.get<AdminTeam[]>({ url: '/v1/admin/teams' }),
  saveTeam: (id: string, body: { name?: string; seatLimit?: number; status?: AdminTeam['status']; billingEnabled?: boolean }) =>
    request.request<AdminTeam>({ url: `/v1/admin/teams/${id}`, method: 'PATCH', data: body, showSuccessMessage: true }),
  adjustTeamCredits: (id: string, body: { amount: number; reason: string }) =>
    request.post({ url: `/v1/admin/teams/${id}/credits`, data: body, showSuccessMessage: true }),
  saveTeamMemberQuota: (id: string, userId: string, monthlyCreditLimit: number | null) =>
    request.request({ url: `/v1/admin/teams/${id}/members/${userId}/quota`, method: 'PATCH', data: { monthlyCreditLimit }, showSuccessMessage: true }),
  teamAuditLogs: (id: string) => request.get<TeamAuditLog[]>({ url: `/v1/admin/teams/${id}/audit-logs` }),
  teamResources: (id: string) => request.get<AdminTeamResources>({ url: `/v1/admin/teams/${id}/resources` }),
  modelVendors: () => request.get<ModelVendor[]>({ url: '/v1/admin/model-vendors' }),
  saveModelVendor: (body: Record<string, unknown>, id?: string) =>
    request.request<ModelVendor>({
      url: id ? `/v1/admin/model-vendors/${id}` : '/v1/admin/model-vendors',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteModelVendor: (id: string) =>
    request.del({ url: `/v1/admin/model-vendors/${id}`, showSuccessMessage: true }),
  providerTemplates: () =>
    request.get<ProviderTemplate[]>({ url: '/v1/admin/provider-templates' }),
  saveProviderTemplate: (body: Record<string, unknown>, id?: string) =>
    request.request<ProviderTemplate>({
      url: id ? `/v1/admin/provider-templates/${id}` : '/v1/admin/provider-templates',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteProviderTemplate: (id: string) =>
    request.del({ url: `/v1/admin/provider-templates/${id}`, showSuccessMessage: true }),
  saveProvider: (body: Record<string, unknown>, id?: string) =>
    request.request<Provider>({
      url: id ? `/v1/admin/providers/${id}` : '/v1/admin/providers',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteProvider: (id: string) =>
    request.del({ url: `/v1/admin/providers/${id}`, showSuccessMessage: true }),
  discoverProvider: (id: string) =>
    request.post<{ models: string[]; candidates: DiscoveredModel[]; latencyMs: number }>({
      url: `/v1/admin/providers/${id}/discover-models`,
      params: {}
    }),
  importProviderModels: (
    id: string,
    body: { modelIds?: string[]; importAll?: boolean; markupPercent?: number; overwritePricing?: boolean }
  ) =>
    request.post<{ discovered: number; selected: number; imported: number }>({
      url: `/v1/admin/providers/${id}/import-models`,
      data: body,
      showSuccessMessage: true
    }),
  checkProviders: () =>
    request.post<{ checked: number; healthy: number; unhealthy: number }>({
      url: '/v1/admin/providers/check-all',
      params: {}
    }),
  models: () => request.get<ModelPreset[]>({ url: '/v1/admin/model-presets' }),
  saveModel: (body: Record<string, unknown>, id?: string) =>
    request.request<ModelPreset>({
      url: id ? `/v1/admin/model-presets/${id}` : '/v1/admin/model-presets',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  saveModelRoutes: (id: string, routes: Array<Omit<ModelProviderRoute, 'id' | 'provider'>>) =>
    request.request<ModelPreset>({
      url: `/v1/admin/model-presets/${id}/routes`,
      method: 'PUT',
      data: { routes },
      showSuccessMessage: true
    }),
  deleteModel: (id: string) =>
    request.del({ url: `/v1/admin/model-presets/${id}`, showSuccessMessage: true }),
  plans: () => request.get<SubscriptionPlan[]>({ url: '/v1/admin/subscriptions/plans' }),
  savePlan: (body: Record<string, unknown>, id?: string) =>
    request.request<SubscriptionPlan>({
      url: id ? `/v1/admin/subscriptions/plans/${id}` : '/v1/admin/subscriptions/plans',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deletePlan: (id: string) =>
    request.del({ url: `/v1/admin/subscriptions/plans/${id}`, showSuccessMessage: true }),
  subscriptions: () => request.get<UserSubscription[]>({ url: '/v1/admin/subscriptions/active' }),
  subscriptionOrders: () =>
    request.get<SubscriptionOrder[]>({ url: '/v1/admin/subscriptions/orders' }),
  grantSubscription: (body: { userId: string; planId: string; days?: number }) =>
    request.post({ url: '/v1/admin/subscriptions/grant', data: body, showSuccessMessage: true }),
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
  savePromotion: (body: Record<string, unknown>, id?: string) => request.request<PromotionCampaign>({ url: id ? `/v1/admin/commerce/promotions/${id}` : '/v1/admin/commerce/promotions', method: id ? 'PATCH' : 'POST', data: body, showSuccessMessage: true }),
  deletePromotion: (id: string) => request.del({ url: `/v1/admin/commerce/promotions/${id}`, showSuccessMessage: true }),
  couponTemplates: () => request.get<CouponTemplate[]>({ url: '/v1/admin/commerce/coupon-templates' }),
  saveCouponTemplate: (body: Record<string, unknown>, id?: string) => request.request<CouponTemplate>({ url: id ? `/v1/admin/commerce/coupon-templates/${id}` : '/v1/admin/commerce/coupon-templates', method: id ? 'PATCH' : 'POST', data: body, showSuccessMessage: true }),
  deleteCouponTemplate: (id: string) => request.del({ url: `/v1/admin/commerce/coupon-templates/${id}`, showSuccessMessage: true }),
  grantCoupon: (body: { userId: string; templateId: string }) => request.post({ url: '/v1/admin/commerce/coupons/grant', data: body, showSuccessMessage: true }),
  adminPermissions: () => request.get<AdminPermission[]>({ url: '/v1/admin/roles/catalog' }),
  adminRoles: () => request.get<AdminRoleRecord[]>({ url: '/v1/admin/roles' }),
  administrators: () => request.get<AdministratorRecord[]>({ url: '/v1/admin/roles/administrators' }),
  saveAdminRole: (body: Record<string, unknown>, id?: string) => request.request<AdminRoleRecord>({ url: id ? `/v1/admin/roles/${id}` : '/v1/admin/roles', method: id ? 'PATCH' : 'POST', data: body, showSuccessMessage: true }),
  deleteAdminRole: (id: string) => request.del({ url: `/v1/admin/roles/${id}`, showSuccessMessage: true }),
  assignAdminRole: (userId: string, adminRoleId: string | null) => request.request({ url: `/v1/admin/roles/administrators/${userId}`, method: 'PATCH', data: { adminRoleId }, showSuccessMessage: true }),
  invoiceRequests: (status?: string) => request.get<InvoiceRequestRecord[]>({ url: '/v1/admin/invoices', params: status ? { status } : undefined }),
  reviewInvoice: (id: string) => request.post({ url: `/v1/admin/invoices/${id}/review`, params: {}, showSuccessMessage: true }),
  issueInvoice: (id: string, body: { invoiceNumber: string; invoiceUrl: string }) => request.post({ url: `/v1/admin/invoices/${id}/issue`, data: body, showSuccessMessage: true }),
  rejectInvoice: (id: string, reason: string) => request.post({ url: `/v1/admin/invoices/${id}/reject`, data: { reason }, showSuccessMessage: true }),
  accountDeletions: (status?: string) => request.get<AccountDeletionRecord[]>({ url: '/v1/admin/account-deletions', params: status ? { status } : undefined }),
  processAccountDeletion: (id: string) => request.post({ url: `/v1/admin/account-deletions/${id}/process`, params: {}, showSuccessMessage: true }),
  renewalAttempts: (status?: string) => request.get<RenewalAttemptRecord[]>({ url: '/v1/admin/subscriptions/renewal-attempts', params: status ? { status } : undefined }),
  retryRenewal: (id: string) => request.post({ url: `/v1/admin/subscriptions/renewal-attempts/${id}/retry`, params: {}, showSuccessMessage: true }),
  referrals: (status?: string) => request.get<ReferralRecord[]>({ url: '/v1/admin/referrals', params: status ? { status } : undefined }),
  approveReferral: (id: string, releaseNow = false) => request.post({ url: `/v1/admin/referrals/${id}/approve`, data: { releaseNow }, showSuccessMessage: true }),
  rejectReferral: (id: string, reason: string) => request.post({ url: `/v1/admin/referrals/${id}/reject`, data: { reason }, showSuccessMessage: true }),
  rechargePackages: () => request.get<RechargePackage[]>({ url: '/v1/admin/recharge-packages' }),
  saveRechargePackage: (body: Record<string, unknown>, id?: string) =>
    request.request<RechargePackage>({
      url: id ? `/v1/admin/recharge-packages/${id}` : '/v1/admin/recharge-packages',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteRechargePackage: (id: string) =>
    request.del({ url: `/v1/admin/recharge-packages/${id}`, showSuccessMessage: true }),
  paymentChannels: () => request.get<PaymentChannel[]>({ url: '/v1/admin/payments/channels' }),
  paymentSummary: () => request.get<PaymentSummary>({ url: '/v1/admin/payments/summary' }),
  paymentReconciliation: () =>
    request.get<PaymentReconciliation>({ url: '/v1/admin/payments/reconciliation' }),
  savePaymentChannel: (body: Record<string, unknown>, id?: string) =>
    request.request<PaymentChannel>({
      url: id ? `/v1/admin/payments/channels/${id}` : '/v1/admin/payments/channels',
      method: id ? 'PATCH' : 'POST',
      data: body,
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
  createRedemptionCode: (body: Record<string, unknown>) =>
    request.post<RedemptionCode & { plainCode: string }>({
      url: '/v1/admin/redemption-codes',
      data: body
    }),
  setRedemptionCodeStatus: (id: string, enabled: boolean) =>
    request.request({
      url: `/v1/admin/redemption-codes/${id}/status`,
      method: 'PATCH',
      data: { enabled },
      showSuccessMessage: true
    }),
  contentPages: (params?: Record<string, string | number>) =>
    request.get<{ items: ContentPage[]; total: number; page: number; pageSize: number }>({
      url: '/v1/admin/content-pages',
      params
    }),
  contentPage: (id: string) => request.get<ContentPage>({ url: `/v1/admin/content-pages/${id}` }),
  saveContentPage: (body: Record<string, unknown>, id?: string) =>
    request.request<ContentPage>({
      url: id ? `/v1/admin/content-pages/${id}` : '/v1/admin/content-pages',
      method: id ? 'PATCH' : 'POST',
      data: body,
      showSuccessMessage: true
    }),
  deleteContentPage: (id: string) =>
    request.del({ url: `/v1/admin/content-pages/${id}`, showSuccessMessage: true }),
  systemSettings: () => request.get<SystemSettings>({ url: '/v1/admin/system-settings' }),
  capabilityRegistry: () => request.get<CapabilityRegistrySnapshot>({ url: '/v1/admin/capability-registry' }),
  adminMfaStatus: () => request.get<AdminMfaStatus>({ url: '/v1/auth/admin/mfa/status' }),
  beginAdminMfaSetup: () => request.post<AdminMfaSetup>({ url: '/v1/auth/admin/mfa/setup' }),
  enableAdminMfa: (ticket: string, code: string) => request.post<{ enabled: true; recoveryCodes: string[] }>({ url: '/v1/auth/admin/mfa/enable', data: { ticket, code } }),
  regenerateAdminMfaRecoveryCodes: (code: string) => request.post<{ recoveryCodes: string[] }>({ url: '/v1/auth/admin/mfa/recovery-codes', data: { code } }),
  verifyAdminMfaSession: (code: string) => request.post<{ verified: true; verifiedAt: string }>({ url: '/v1/auth/admin/mfa/verify-session', data: { code } }),
  disableAdminMfa: (password: string, code: string) => request.post<{ enabled: false }>({ url: '/v1/auth/admin/mfa/disable', data: { password, code } }),
  uploadChatHomeImage: (data: FormData) =>
    request.post<{ assetId: string; imageUrl: string }>({
      url: '/v1/admin/system-settings/chat-home-image',
      data,
      showSuccessMessage: true
    }),
  saveSystemSettings: (body: Record<string, unknown>) =>
    request.request<SystemSettings>({
      url: '/v1/admin/system-settings',
      method: 'PATCH',
      data: body,
      showSuccessMessage: true
    }),
  works: (params?: Record<string, string>) =>
    request.get<AdminPublishedWork[]>({ url: '/v1/admin/works', params }),
  reviewWork: (id: string, body: { status: 'APPROVED' | 'REJECTED'; reason?: string }) =>
    request.post<AdminPublishedWork>({ url: `/v1/admin/works/${id}/review`, data: body, showSuccessMessage: true }),
  featureWork: (id: string, featured: boolean) =>
    request.request({ url: `/v1/admin/works/${id}/feature`, method: 'PATCH', data: { featured }, showSuccessMessage: true }),
  takeDownWork: (id: string, reason: string) =>
    request.post({ url: `/v1/admin/works/${id}/take-down`, data: { reason }, showSuccessMessage: true }),
  workReports: (status?: string) =>
    request.get<AdminWorkReport[]>({ url: '/v1/admin/works/reports/list', params: status ? { status } : undefined }),
  resolveWorkReport: (id: string, body: { status: 'RESOLVED' | 'DISMISSED'; resolution: string }) =>
    request.post({ url: `/v1/admin/works/reports/${id}/resolve`, data: body, showSuccessMessage: true })
}
