import type { Component } from 'vue'
import type { StudioMode } from '../../types'

export type SettingsSection = 'general' | 'personalization' | 'notifications' | 'data' | 'api' | 'workspace' | 'teams' | 'support' | 'account'

export interface WorkspaceSettings {
  notifications: boolean
  rememberModel: boolean
  language: string
  appearance: string
  style: string
  detail: string
  replyLanguage: string
  customInstructions: string
  nickname: string
  occupation: string
  bio: string
  useMemory: boolean
  referenceChats: boolean
  chatHistoryEnabled: boolean
  trainingOptOut: boolean
  temporaryChatDefault: boolean
  dataRetentionDays: number
  shareUsageAnalytics: boolean
}

export interface PublicSettings {
  userByokEnabled: boolean
  newApiConsoleUrl: string
  newApiProvisioningGroups: string[]
  sidebarCreationEnabled: boolean
  sidebarCommerceEnabled: boolean
  sidebarOfficeEnabled: boolean
  sidebarPromptsEnabled: boolean
  sidebarPluginsEnabled: boolean
  sidebarProjectsEnabled: boolean
  sidebarAssetsEnabled: boolean
}

export interface UserSettingsResponse { appearance?: string; language?: string; responseStyle?: string; responseDetail?: string; replyLanguage?: string; customInstructions?: string; nickname?: string; occupation?: string; bio?: string; useMemory?: boolean; referenceChats?: boolean; notifications?: boolean; chatHistoryEnabled?: boolean; trainingOptOut?: boolean; temporaryChatDefault?: boolean; dataRetentionDays?: number; shareUsageAnalytics?: boolean }
export interface UserResponse { role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'; settings?: UserSettingsResponse | null }
export interface OnlyCodeBalance { balance: number; symbol: string; displayType: string }
export interface NotificationItem { id: string; title?: string; body?: string; content?: string; readAt?: string | null; createdAt: string }
export interface ModerationAppeal { id: string; status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; reason: string; reviewNote: string; createdAt: string; reviewedAt?: string | null }
export interface ModerationCase { id: string; source: string; action: string; status: 'OPEN' | 'APPROVED' | 'DISMISSED'; contentExcerpt: string; createdAt: string; appeal?: ModerationAppeal | null }
export type ProviderType = 'OPENAI' | 'NEW_API' | 'SUB2API' | 'OPENAI_COMPATIBLE'
export type AuthType = 'BEARER' | 'X_API_KEY' | 'BOTH'
export interface ProviderTemplate { id: string; name: string; type: ProviderType; baseUrl: string; authType: AuthType; apiProtocol: 'openai' | 'anthropic' | 'gemini'; supportsDiscovery: boolean }
export interface ApiCredential { id: string; name: string; templateId?: string | null; provisionKey?: string | null; externalTokenId?: string | null; providerType: ProviderType; baseUrl: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean; priority: number; weight: number; lastHealthStatus?: string | null; lastRotatedAt?: string | null; expiresAt?: string | null; totalRequests?: number; totalFailures?: number; inputTokens?: string; outputTokens?: string }
export interface CredentialEditor extends Partial<ApiCredential> { name: string; templateId: string; providerType: ProviderType; baseUrl: string; apiKey: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean; priority: number; weight: number; expiresAt: string; autoImport: boolean }
export interface PrivateModelRoute { id?: string; credentialId: string; upstreamModel: string; enabled: boolean; priority: number; weight: number; credential: Pick<ApiCredential, 'id' | 'name' | 'apiKeyHint' | 'enabled' | 'lastHealthStatus'> }
export interface AvailableModel { key: string; displayName: string; capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' }
export interface PrivateModel { id: string; displayName: string; description: string; capability: AvailableModel['capability']; apiProtocol: 'openai' | 'anthropic' | 'gemini'; routingStrategy: 'PRIORITY' | 'WEIGHTED' | 'ROUND_ROBIN'; enabled: boolean; isDefault: boolean; routes: PrivateModelRoute[] }
export interface PrivateModelEditor extends Omit<PrivateModel, 'routes'> { routes: Array<Omit<PrivateModelRoute, 'credential'>> }
export interface DeletionRequest { id: string; status: 'REQUESTED' | 'PROCESSING' | 'FAILED'; requestedAt: string; scheduledAt: string; failureReason: string }
export interface ExternalNavLinkItem { id: string; key: string; name: string; description: string; url: string; icon: string; enabled: boolean; openNewTab: boolean; sortOrder: number }
export interface TeamMember { userId: string; role: string; user: { displayName: string; email: string | null } }
export interface TeamInvitation { id: string; email: string; role: string; expiresAt: string }
export interface PendingTeamInvitation { id: string; role: string; expiresAt: string; team: { id: string; name: string; owner: { displayName: string } } }
export interface Team { id: string; name: string; slug: string; description: string; ownerId: string; seatLimit: number; members: TeamMember[]; invitations: TeamInvitation[]; _count?: { projects: number; assets: number; knowledgeBases: number } }
export interface WorkspaceAsset { id: string; name: string; teamId?: string | null }
export interface KnowledgeBaseAsset { assetId: string; chunkCount: number; asset: WorkspaceAsset }
export interface KnowledgeBase { id: string; name: string; description: string; status: string; documentCount: number; chunkCount: number; teamId?: string | null; team?: { id: string; name: string } | null; creator?: { id: string; displayName: string }; assets: KnowledgeBaseAsset[] }
export interface TeamResources { projects: Array<{ id: string; name: string; workflowStatus: string; _count: { assets: number; conversations: number } }>; assets: Array<{ id: string; name: string; kind: string }>; knowledgeBases: Array<{ id: string; name: string; documentCount: number }> }
export interface AssistantToolBinding { key: string; assistant: { id: string; name: string }; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; approval?: { id: string; status: string; expiresAt?: string | null } }
export interface WorkspaceNavItem { key: string; mode: StudioMode; activeModes?: StudioMode[]; label: string; icon: Component; to: string; external: boolean; openNewTab: boolean }
export interface ToolApproval { id: string; assistant?: { id: string; name: string } | null; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; status: string; expiresAt?: string | null }
export interface WorkspaceAssistant { id: string; name: string; tools: { toolId: string }[] }
export interface TeamDraft { name: string; description: string }
export interface KnowledgeDraft { name: string; description: string; teamId: string }

export type ExperienceLevel = 'BEGINNER' | 'EXPERIENCED' | ''
export type CapabilityType = 'CHAT' | 'IMAGE' | 'VIDEO'

export interface OnboardingStatus {
  required: boolean
  experience: ExperienceLevel
  capabilities: CapabilityType[]
  completedAt: string | null
}

export interface UpdateOnboardingDto {
  experience?: ExperienceLevel
  capabilities?: CapabilityType[]
  complete?: boolean
}

export interface OnlyCodeGroupInfo {
  name: string
  ratio: number
  models: string[]
  capabilities: CapabilityType[]
}
