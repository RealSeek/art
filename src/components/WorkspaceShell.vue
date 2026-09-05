<template>
  <div class="workspace-shell" :class="{ 'is-collapsed': !sidebarOpen, 'is-canvas-route': props.canvasRoute }">
    <ShellSidebar
      v-model:sidebar-open="sidebarOpen"
      v-model:mobile-open="mobileOpen"
      v-model:account-open="accountOpen"
      v-model:conversation-menu-id="conversationMenuId"
      v-model:conversation-rename="conversationRename"
      :active-mode="activeMode"
      :settings="settings"
      :public-settings="publicSettings"
      :only-code-balance="onlyCodeBalance"
      :external-links="externalLinks"
      :workspace-data-loaded="workspaceDataLoaded"
      :conversation-menu-position="conversationMenuPosition"
      :renaming-conversation-id="renamingConversationId"
      :conversation-rename-busy="conversationRenameBusy"
      :open-settings="openSettings"
      :show-settings="() => { settingsOpen = true }"
      :logout="logout"
      :close-conversation-menu="closeConversationMenu"
      :start-conversation-rename="startConversationRename"
      :save-conversation-rename="saveConversationRename"
      :cancel-conversation-rename="cancelConversationRename"
    />

    <main ref="workspaceMain" class="workspace-main" :class="{ 'workspace-main--chat': activeMode === 'chat' || activeMode === 'office' }">
      <ShellHeader
        v-model:mobile-open="mobileOpen"
        v-model:chat-actions-open="chatActionsOpen"
        :active-mode="activeMode"
        :workspace-data-loaded="workspaceDataLoaded"
        :conversation-action-busy="conversationActionBusy"
        :share-conversation="shareConversation"
        :toggle-conversation-pinned="toggleConversationPinned"
        :archive-conversation="archiveConversation"
        :delete-conversation="deleteConversation"
      />
      <slot />
    </main>

    <Teleport to="body">
      <div
        v-if="activeConversationMenu"
        ref="conversationMenuElement"
        class="workspace-recent-menu"
        role="menu"
        :aria-label="`打开“${activeConversationMenu.title}”的对话选项`"
        :style="{ left: `${conversationMenuPosition.left}px`, top: `${conversationMenuPosition.top}px` }"
        @click.stop
      >
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="shareConversation(activeConversationMenu)"><Share2 :size="16" />分享</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="startConversationRename(activeConversationMenu)"><Pencil :size="16" />重命名</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="toggleConversationPinned(activeConversationMenu)"><PinOff v-if="activeConversationMenu.pinnedAt" :size="16" /><Pin v-else :size="16" />{{ activeConversationMenu.pinnedAt ? '取消置顶' : '置顶聊天' }}</button>
        <button v-if="!activeConversationMenu.archivedAt" role="menuitem" type="button" :disabled="conversationActionBusy" @click="archiveConversation(activeConversationMenu.id)"><Archive :size="16" />归档</button>
        <button v-else role="menuitem" type="button" :disabled="conversationActionBusy" @click="restoreConversation(activeConversationMenu.id)"><ArchiveRestore :size="16" />恢复</button>
        <button class="is-danger" role="menuitem" type="button" :disabled="conversationActionBusy" @click="deleteConversation(activeConversationMenu)"><Trash2 :size="16" />删除</button>
      </div>
      <SettingsDialog
        v-if="settingsOpen"
        :settings-section="settingsSection"
        :settings-nav="settingsNav"
        :nav-ref="setSettingsNavElement"
        @close="settingsOpen = false"
        @select="selectSettingsSection"
      >
        <GeneralSection v-if="settingsSection === 'general'" :settings="settings" />
        <PersonalizationSection
          v-else-if="settingsSection === 'personalization'"
          :settings="settings"
          :settings-message="settingsMessage"
          :save-settings="saveSettings"
        />
        <NotificationsSection
          v-else-if="settingsSection === 'notifications'"
          :settings="settings"
          :notifications="notifications"
          :unread-count="unreadCount"
          :mark-all-read="markAllRead"
        />
        <DataSection
          v-else-if="settingsSection === 'data'"
          :settings="settings"
          :data-action-busy="dataActionBusy"
          :data-action-message="dataActionMessage"
          :data-action-error="dataActionError"
          :moderation-cases="moderationCases"
          :appeal-drafts="appealDrafts"
          :appeal-busy-id="appealBusyId"
          :appeal-message="appealMessage"
          :appeal-error="appealError"
          :export-account-data="exportAccountData"
          :clear-conversation-history="clearConversationHistory"
          :submit-moderation-appeal="submitModerationAppeal"
          :cancel-moderation-appeal="cancelModerationAppeal"
        />
        <ApiSection
          v-else-if="settingsSection === 'api'"
          :provisioning-group-details="onlyCodeGroups"
          :groups-loading="onlyCodeGroupsLoading"
          :provisioning-busy-group="onlyCodeProvisioningBusyGroup"
          :api-credentials="apiCredentials"
          :credential-checking-id="credentialCheckingId"
          :open-credential-editor="openCredentialEditor"
          :discover-credential="discoverCredential"
          :delete-credential="deleteCredential"
          :provision-only-code="provisionOnlyCodeCredential"
        />
        <WorkspaceSection
          v-else-if="settingsSection === 'workspace'"
          :knowledge-draft="knowledgeDraft"
          :teams="teams"
          :workspace-busy="workspaceBusy"
          :knowledge-bases="knowledgeBases"
          :workspace-assets="workspaceAssets"
          :knowledge-asset-selection="knowledgeAssetSelection"
          :knowledge-team-selection="knowledgeTeamSelection"
          :workspace-tools="workspaceTools"
          :workspace-assistants="workspaceAssistants"
          :tool-approvals="toolApprovals"
          :workspace-message="workspaceMessage"
          :workspace-error="workspaceError"
          :create-knowledge-base="createKnowledgeBase"
          :detach-knowledge-asset="detachKnowledgeAsset"
          :attach-knowledge-asset="attachKnowledgeAsset"
          :assign-knowledge-base-team="assignKnowledgeBaseTeam"
          :edit-knowledge-base="editKnowledgeBase"
          :delete-knowledge-base="deleteKnowledgeBase"
          :request-tool-approval="requestToolApproval"
          :cancel-tool-approval="cancelToolApproval"
        />
        <TeamsSection
          v-else-if="settingsSection === 'teams'"
          v-model:team-invite-id="teamInviteId"
          v-model:team-invite-email="teamInviteEmail"
          v-model:team-invite-role="teamInviteRole"
          :pending-team-invitations="pendingTeamInvitations"
          :teams="teams"
          :team-busy="teamBusy"
          :team-message="teamMessage"
          :team-error="teamError"
          :team-draft="teamDraft"
          :expanded-team-id="expandedTeamId"
          :team-resources="teamResources"
          :accept-team-invitation="acceptTeamInvitation"
          :create-team="createTeam"
          :edit-team="editTeam"
          :leave-team="leaveTeam"
          :delete-team="deleteTeam"
          :toggle-team-resources="toggleTeamResources"
          :transfer-team-ownership="transferTeamOwnership"
          :update-team-member-role="updateTeamMemberRole"
          :remove-team-member="removeTeamMember"
          :cancel-team-invitation="cancelTeamInvitation"
          :invite-to-team="inviteToTeam"
        />
        <SupportCenter v-else-if="settingsSection === 'support'" />
        <AccountSection
          v-else
          v-model:deletion-reason="deletionReason"
          :account-deletion="accountDeletion"
          :deletion-busy="deletionBusy"
          :deletion-message="deletionMessage"
          :logout="logout"
          :request-account-deletion="requestAccountDeletion"
          :cancel-account-deletion="cancelAccountDeletion"
          :close-settings="() => { settingsOpen = false }"
        />
      </SettingsDialog>
      <ApiKeyDialog
        v-if="credentialEditor"
        :editor="credentialEditor"
        :credential-saving="credentialSaving"
        :credential-error="credentialError"
        :save-credential="saveCredential"
        @close="credentialEditor = null"
      />
      <PrivateModelDialog
        v-if="privateModelEditor"
        :editor="privateModelEditor"
        :api-credentials="apiCredentials"
        :discovered-credential-models="discoveredCredentialModels"
        :private-model-saving="privateModelSaving"
        :private-model-error="privateModelError"
        :save-private-model="savePrivateModel"
        @close="privateModelEditor = null"
      />
      <OnboardingFlow
        v-if="onboardingRequired"
        :api-credentials="apiCredentials"
        :preview-mode="onboardingPreviewMode"
        @completed="handleOnboardingCompleted"
        @refresh-credentials="handleRefreshCredentials"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import {
  Archive,
  ArchiveRestore,
  Bell,
  BookOpen,
  KeyRound,
  LifeBuoy,
  Pencil,
  Pin,
  PinOff,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Users,
  UserRound,
} from 'lucide-vue-next'
import OnboardingFlow from './onboarding/OnboardingFlow.vue'
import SupportCenter from './SupportCenter.vue'
import ShellSidebar from './shell/ShellSidebar.vue'
import ShellHeader from './shell/ShellHeader.vue'
import SettingsDialog from './shell/settings/SettingsDialog.vue'
import GeneralSection from './shell/settings/sections/GeneralSection.vue'
import PersonalizationSection from './shell/settings/sections/PersonalizationSection.vue'
import NotificationsSection from './shell/settings/sections/NotificationsSection.vue'
import DataSection from './shell/settings/sections/DataSection.vue'
import ApiSection from './shell/settings/sections/ApiSection.vue'
import WorkspaceSection from './shell/settings/sections/WorkspaceSection.vue'
import TeamsSection from './shell/settings/sections/TeamsSection.vue'
import AccountSection from './shell/settings/sections/AccountSection.vue'
import ApiKeyDialog from './shell/ApiKeyDialog.vue'
import PrivateModelDialog from './shell/PrivateModelDialog.vue'
import type { StudioMode } from '../types'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { useStudioStore } from '../stores/studio'
import { api, apiUrl } from '../services/api'
import { readStoredSettings, updateStoredSettings, writeStoredSettings } from '../utils/settings-storage'
import { useTeamManagement } from '../composables/shell/useTeamManagement'
import { useKnowledgeBases } from '../composables/shell/useKnowledgeBases'
import { useConversationActions } from '../composables/shell/useConversationActions'
import type {
  ApiCredential,
  AssistantToolBinding,
  AvailableModel,
  CredentialEditor,
  DeletionRequest,
  ExternalNavLinkItem,
  KnowledgeBase,
  ModerationCase,
  NotificationItem,
  OnboardingStatus,
  OnlyCodeBalance,
  OnlyCodeGroupInfo,
  PendingTeamInvitation,
  PrivateModel,
  PrivateModelEditor,
  ProviderTemplate,
  PublicSettings,
  SettingsSection,
  Team,
  ToolApproval,
  UserResponse,
  UserSettingsResponse,
  WorkspaceAsset,
  WorkspaceAssistant,
  WorkspaceSettings,
} from './shell/types'

const props = defineProps<{
  activeMode: StudioMode
  canvasRoute?: boolean
}>()

// 侧边栏折叠状态持久化到本地设置，刷新后保持。
const sidebarOpen = ref(readStoredSettings().sidebarCollapsed !== true)
watch(sidebarOpen, (open) => {
  updateStoredSettings((current) => ({ ...current, sidebarCollapsed: !open }))
})
const workspaceMain = ref<HTMLElement | null>(null)
const mobileOpen = ref(false)
const conversationMenuElement = ref<HTMLElement | null>(null)
const conversationMenuPosition = reactive({ left: 0, top: 0 })
const settingsOpen = ref(false)
const chatActionsOpen = ref(false)
const settingsSection = ref<SettingsSection>('general')
const settingsNavElement = ref<HTMLElement | null>(null)
const accountOpen = ref(false)
const onlyCodeBalance = ref<OnlyCodeBalance | null>(null)
const auth = useAuthStore()
const catalog = useCatalogStore()
const studio = useStudioStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const message = useMessage()
const {
  conversationMenuId,
  conversationRename,
  conversationActionBusy,
  renamingConversationId,
  conversationRenameBusy,
  activeConversationMenu,
  closeConversationMenu,
  shareConversation,
  toggleConversationPinned,
  startConversationRename,
  cancelConversationRename,
  saveConversationRename,
  archiveConversation,
  restoreConversation,
  deleteConversation,
} = useConversationActions()
const notifications = ref<NotificationItem[]>([])
const moderationCases = ref<ModerationCase[]>([])
const appealDrafts = reactive<Record<string, string>>({})
const appealBusyId = ref('')
const appealMessage = ref('')
const appealError = ref(false)
const settingsHydrated = ref(false)
const workspaceDataLoaded = ref(false)
const settingsMessage = ref('')
const {
  teams, pendingTeamInvitations, teamDraft, teamInviteId, teamInviteEmail, teamInviteRole,
  teamBusy, teamMessage, teamError, expandedTeamId, teamResources,
  createTeam, inviteToTeam, acceptTeamInvitation,
  cancelTeamInvitation, transferTeamOwnership, removeTeamMember, updateTeamMemberRole,
  editTeam, leaveTeam, deleteTeam, toggleTeamResources
} = useTeamManagement()
const workspaceAssets = ref<WorkspaceAsset[]>([])
const toolApprovals = ref<ToolApproval[]>([])
const workspaceTools = ref<AssistantToolBinding['tool'][]>([])
const workspaceAssistants = ref<WorkspaceAssistant[]>([])
const workspaceBusy = ref(false)
const workspaceMessage = ref('')
const workspaceError = ref(false)
const {
  knowledgeBases, knowledgeDraft, knowledgeAssetSelection, knowledgeTeamSelection,
  createKnowledgeBase, editKnowledgeBase, deleteKnowledgeBase,
  assignKnowledgeBaseTeam, attachKnowledgeAsset, detachKnowledgeAsset
} = useKnowledgeBases({ busy: workspaceBusy, message: workspaceMessage, error: workspaceError })
const apiCredentials = ref<ApiCredential[]>([])
const onlyCodeGroups = ref<OnlyCodeGroupInfo[]>([])
const onlyCodeGroupsLoading = ref(false)
const onboardingRequired = ref(false)
const onboardingPreviewMode = ref(false)
const providerTemplates = ref<ProviderTemplate[]>([])
const privateModels = ref<PrivateModel[]>([])
const credentialEditor = ref<CredentialEditor | null>(null)
const credentialSaving = ref(false)
const credentialError = ref('')
const credentialCheckingId = ref('')
const onlyCodeProvisioningBusyGroup = ref('')
const discoveredCredentialModels = ref<string[]>([])
const privateModelEditor = ref<PrivateModelEditor | null>(null)
const privateModelSaving = ref(false)
const privateModelError = ref('')
const publicSettings = reactive<PublicSettings>({
  userByokEnabled: true,
  newApiConsoleUrl: '#',
  newApiProvisioningGroups: [],
  sidebarCreationEnabled: true,
  sidebarCommerceEnabled: true,
  sidebarOfficeEnabled: true,
  sidebarPromptsEnabled: true,
  sidebarPluginsEnabled: true,
  sidebarProjectsEnabled: true,
  sidebarAssetsEnabled: true,
})
const externalLinks = ref<ExternalNavLinkItem[]>([])
const availableModels = ref<AvailableModel[]>([])
const accountDeletion = ref<DeletionRequest | null>(null)
const deletionReason = ref('')
const deletionBusy = ref(false)
const deletionMessage = ref('')
const dataActionBusy = ref(false)
const dataActionMessage = ref('')
const dataActionError = ref(false)
const unreadCount = computed(() => notifications.value.filter((item) => !item.readAt).length)
const storedSettings = readStoredSettings()
const storedLanguage = storedSettings.language === 'English' ? 'en' : storedSettings.language === '中文' ? 'zh-CN' : storedSettings.language
const storedAppearance = storedSettings.appearance === 'light' ? '浅色' : storedSettings.appearance === 'dark' ? '深色' : storedSettings.appearance === 'system' ? '跟随系统' : storedSettings.appearance
const settings = reactive<WorkspaceSettings>({
  notifications: storedSettings.notifications ?? true,
  rememberModel: storedSettings.rememberModel ?? true,
  language: storedLanguage || 'zh-CN',
  appearance: storedAppearance || '跟随系统',
  style: storedSettings.style || '默认',
  detail: storedSettings.detail || '自动判断',
  replyLanguage: storedSettings.replyLanguage || '跟随对话',
  customInstructions: storedSettings.customInstructions || '',
  nickname: storedSettings.nickname || '',
  occupation: storedSettings.occupation || '',
  bio: storedSettings.bio || '',
  useMemory: storedSettings.useMemory ?? true,
  referenceChats: storedSettings.referenceChats ?? true,
  chatHistoryEnabled: storedSettings.chatHistoryEnabled ?? true,
  trainingOptOut: storedSettings.trainingOptOut ?? true,
  temporaryChatDefault: storedSettings.temporaryChatDefault ?? false,
  dataRetentionDays: storedSettings.dataRetentionDays ?? 0,
  shareUsageAnalytics: storedSettings.shareUsageAnalytics ?? false,
})
const settingsNav = computed(() => [
  { id: 'general' as const, label: t('settings.general'), icon: Sun },
  { id: 'personalization' as const, label: t('settings.personalization'), icon: Sparkles },
  { id: 'notifications' as const, label: t('settings.notifications'), icon: Bell },
  { id: 'data' as const, label: t('settings.data'), icon: SlidersHorizontal },
  { id: 'api' as const, label: t('settings.api'), icon: KeyRound },
  { id: 'workspace' as const, label: '知识与工具', icon: BookOpen },
  { id: 'teams' as const, label: '团队空间', icon: Users },
  { id: 'support' as const, label: '帮助与客服', icon: LifeBuoy },
  { id: 'account' as const, label: t('settings.account'), icon: UserRound },
])

function applyTheme() {
  document.documentElement.dataset.studioTheme = settings.appearance === '浅色' ? 'light' : settings.appearance === '深色' ? 'dark' : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  locale.value = settings.language
  document.documentElement.lang = settings.language
}

watch(() => [settings.appearance, settings.language], applyTheme, { immediate: true })
let settingsTimer = 0
watch(settings, () => {
  writeStoredSettings(settings)
  if (!settingsHydrated.value) return
  window.clearTimeout(settingsTimer)
  settingsTimer = window.setTimeout(() => { void saveSettings(false) }, 450)
}, { deep: true })
watch(() => props.activeMode, async () => {
  closeConversationMenu()
  mobileOpen.value = false
  accountOpen.value = false
  chatActionsOpen.value = false
  await nextTick()
  workspaceMain.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
})
watch(() => route.fullPath, closeConversationMenu)
onMounted(async () => {
  document.body.classList.add('has-workspace')
  document.addEventListener('pointerdown', handleConversationMenuOutside)
  document.addEventListener('keydown', handleConversationMenuKeydown)
  document.addEventListener('xinyue:open-api-settings', openApiSettings)
  window.addEventListener('resize', closeConversationMenu)
  try {
    await auth.refresh()
    await loadWorkspaceData()
  } finally {
    workspaceDataLoaded.value = true
    settingsHydrated.value = true
  }
  const teamInviteToken = typeof route.query.teamInviteToken === 'string' ? route.query.teamInviteToken : ''
  if (teamInviteToken && auth.session?.id) {
    try {
      const result = await api<{ teamName: string }>(`/team-invitations/${encodeURIComponent(teamInviteToken)}/accept`, { method: 'POST' })
      await loadDeferredWorkspaceData()
      teams.value = await api<Team[]>('/teams')
      teamMessage.value = `已加入团队“${result.teamName}”`
      teamError.value = false
    } catch (reason) {
      teamMessage.value = reason instanceof Error ? reason.message : '接受团队邀请失败'
      teamError.value = true
    }
    const query = { ...route.query }
    delete query.teamInviteToken
    await router.replace({ query })
    openSettings('teams')
  }
  const requestedSection = String(route.query.settings || '') as SettingsSection
  if (settingsNav.value.some((item) => item.id === requestedSection)) openSettings(requestedSection)
})
onUnmounted(() => {
  document.body.classList.remove('has-workspace')
  document.removeEventListener('pointerdown', handleConversationMenuOutside)
  document.removeEventListener('keydown', handleConversationMenuKeydown)
  document.removeEventListener('xinyue:open-api-settings', openApiSettings)
  window.removeEventListener('resize', closeConversationMenu)
})

function openSettings(section: SettingsSection) {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  settingsSection.value = section
  settingsOpen.value = true
  accountOpen.value = false
  mobileOpen.value = false
  if (section === 'api' && auth.session?.id) {
    void loadDeferredWorkspaceData()
    void loadOnlyCodeGroups()
  }
  scrollActiveSetting('auto')
}

function openApiSettings() {
  openSettings('api')
}

function selectSettingsSection(section: SettingsSection) {
  settingsSection.value = section
  if (section === 'api' && auth.session?.id) {
    void loadDeferredWorkspaceData()
    void loadOnlyCodeGroups()
  }
  scrollActiveSetting('smooth')
}

function scrollActiveSetting(behavior: ScrollBehavior) {
  if (!window.matchMedia('(max-width: 640px)').matches) return
  void nextTick(() => settingsNavElement.value?.querySelector<HTMLElement>(`[data-section="${settingsSection.value}"]`)?.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' }))
}

function setSettingsNavElement(el: Element | ComponentPublicInstance | null) {
  settingsNavElement.value = el as HTMLElement | null
}

function settingsPayload() {
  return {
    appearance: settings.appearance === '浅色' ? 'light' : settings.appearance === '跟随系统' ? 'system' : 'dark', language: settings.language,
    responseStyle: settings.style, responseDetail: settings.detail, replyLanguage: settings.replyLanguage,
    customInstructions: settings.customInstructions, nickname: settings.nickname, occupation: settings.occupation,
    bio: settings.bio, useMemory: settings.useMemory, referenceChats: settings.referenceChats, notifications: settings.notifications,
    chatHistoryEnabled: settings.chatHistoryEnabled, trainingOptOut: settings.trainingOptOut, temporaryChatDefault: settings.temporaryChatDefault,
    dataRetentionDays: settings.dataRetentionDays, shareUsageAnalytics: settings.shareUsageAnalytics,
  }
}

async function saveSettings(showFeedback = false) {
  writeStoredSettings(settings)
  if (auth.session?.id) {
    try { await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }); if (showFeedback) settingsMessage.value = '已保存' }
    catch { if (showFeedback) settingsMessage.value = '保存失败，请稍后重试' }
  } else if (showFeedback) settingsMessage.value = '已保存到此设备'
}

async function refreshOnlyCodeBalance() {
  onlyCodeBalance.value = await api<OnlyCodeBalance>('/users/me/only-code-balance', { cache: 'no-store', timeoutMs: 10_000 }).catch(() => null)
}

watch(accountOpen, (open) => {
  if (open && auth.session?.id) void refreshOnlyCodeBalance()
})

async function loadWorkspaceData() {
  const [catalogSettings, links, onboarding] = await Promise.all([
    catalog.load(),
    api<ExternalNavLinkItem[]>('/catalog/external-links').catch(() => []),
    auth.session?.id ? api<OnboardingStatus>('/users/me/onboarding').catch(() => null) : Promise.resolve(null),
  ])
  Object.assign(publicSettings, catalogSettings)
  externalLinks.value = links
  onboardingRequired.value = Boolean(onboarding?.required)
  if (!auth.session?.id) return
  const [, user, notices, cases, models, balance] = await Promise.all([
    studio.hydrateWorkspace().catch(() => undefined),
    api<UserResponse>('/users/me').catch(() => null), api<NotificationItem[]>('/notifications').catch(() => []),
    api<ModerationCase[]>('/moderation/cases').catch(() => []),
    api<AvailableModel[]>('/users/me/models').catch(() => []),
    api<OnlyCodeBalance>('/users/me/only-code-balance', { cache: 'no-store', timeoutMs: 10_000 }).catch(() => null),
  ])
  if (user?.settings) {
    hydrateSettings(user.settings)
    const pending = storedSettings.pendingServerSync
    if (pending?.changedAt && Date.now() - pending.changedAt < 5 * 60 * 1000) {
      if (pending.appearance) settings.appearance = pending.appearance === 'light' ? '浅色' : pending.appearance === 'system' ? '跟随系统' : '深色'
      if (pending.language) settings.language = pending.language
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }).then(() => {
        updateStoredSettings((current) => current.pendingServerSync?.changedAt === pending.changedAt
          ? { ...current, pendingServerSync: undefined }
          : current)
      }).catch(() => undefined)
    }
  }
  onboardingPreviewMode.value = route.query.onboarding === 'preview' && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '')
  if (onboardingPreviewMode.value) onboardingRequired.value = true
  notifications.value = notices
  moderationCases.value = cases
  availableModels.value = models
  onlyCodeBalance.value = balance
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  window.setTimeout(() => { void loadDeferredWorkspaceData() }, 200)
}

async function handleOnboardingCompleted() {
  onboardingRequired.value = false
  onboardingPreviewMode.value = false
  const [credentials, models] = await Promise.all([
    api<ApiCredential[]>('/users/me/api-credentials').catch(() => []),
    api<PrivateModel[]>('/users/me/private-models').catch(() => []),
  ])
  apiCredentials.value = credentials
  privateModels.value = models
  document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
}

async function handleRefreshCredentials() {
  const [credentials, models] = await Promise.all([
    api<ApiCredential[]>('/users/me/api-credentials').catch(() => []),
    api<PrivateModel[]>('/users/me/private-models').catch(() => []),
  ])
  apiCredentials.value = credentials
  privateModels.value = models
}

let deferredWorkspacePromise: Promise<void> | null = null
let deferredWorkspaceLoaded = false
let onlyCodeGroupsPromise: Promise<void> | null = null
function loadOnlyCodeGroups() {
  if (onlyCodeGroupsPromise) return onlyCodeGroupsPromise
  onlyCodeGroupsLoading.value = true
  onlyCodeGroupsPromise = api<OnlyCodeGroupInfo[]>('/users/me/only-code-groups')
    .then((details) => { onlyCodeGroups.value = Array.isArray(details) ? details : [] })
    .catch(() => { onlyCodeGroups.value = [] })
    .finally(() => {
      onlyCodeGroupsLoading.value = false
      onlyCodeGroupsPromise = null
    })
  return onlyCodeGroupsPromise
}

function loadDeferredWorkspaceData() {
  if (deferredWorkspaceLoaded) return Promise.resolve()
  if (deferredWorkspacePromise) return deferredWorkspacePromise
  void loadOnlyCodeGroups()
  deferredWorkspacePromise = (async () => {
    const [credentials, templates, userModels, modelPolicy, teamRows, pendingInvites, knowledgeRows, tools, assistantRows, approvalRows, deletion] = await Promise.all([
      api<ApiCredential[]>('/users/me/api-credentials').catch(() => []),
      api<ProviderTemplate[]>('/catalog/provider-templates').catch(() => []),
      api<PrivateModel[]>('/users/me/private-models').catch(() => []),
      api<{ allowUserByok: boolean }>('/users/me/model-policy').catch(() => null),
      api<Team[]>('/teams').catch(() => []),
      api<PendingTeamInvitation[]>('/team-invitations').catch(() => []),
      api<KnowledgeBase[]>('/knowledge-bases').catch(() => []),
      api<AssistantToolBinding['tool'][]>('/assistants/tools').catch(() => []), api<{ id: string; name: string; tools: { toolId: string }[] }[]>('/assistants').catch(() => []),
      api<typeof toolApprovals.value>('/tool-approvals').catch(() => []),
      api<DeletionRequest | null>('/users/me/deletion').catch(() => null),
    ])
  apiCredentials.value = credentials
  providerTemplates.value = templates
  privateModels.value = userModels
  teams.value = teamRows
  pendingTeamInvitations.value = pendingInvites
  knowledgeBases.value = knowledgeRows
  knowledgeRows.forEach((item) => { knowledgeTeamSelection[item.id] = item.teamId || '' })
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  workspaceTools.value = tools
  workspaceAssistants.value = assistantRows
  toolApprovals.value = approvalRows
  accountDeletion.value = deletion
  if (modelPolicy) publicSettings.userByokEnabled = modelPolicy.allowUserByok
    deferredWorkspaceLoaded = true
  })().finally(() => { deferredWorkspacePromise = null })
  return deferredWorkspacePromise
}

async function requestToolApproval(binding: AssistantToolBinding) {
  const reason = window.prompt(`申请“${binding.tool.name}”权限的用途说明`, '')?.trim()
  if (reason === undefined) return
  workspaceBusy.value = true
  try { await api(`/assistants/${binding.assistant.id}/tools/${binding.tool.id}/approval-requests`, { method: 'POST', body: JSON.stringify({ reason }) }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已提交'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请提交失败' }
  finally { workspaceBusy.value = false }
}
async function cancelToolApproval(binding: AssistantToolBinding) {
  if (!binding.approval?.id || !window.confirm('撤回这条待审批申请？')) return
  workspaceBusy.value = true
  try { await api(`/tool-approvals/${binding.approval.id}`, { method: 'DELETE' }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已撤回'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请撤回失败' }
  finally { workspaceBusy.value = false }
}
async function requestAccountDeletion() {
  if (!window.confirm('提交账户注销申请？7 天冷静期结束后，个人数据将被永久清除。')) return
  deletionBusy.value = true; deletionMessage.value = ''
  try { accountDeletion.value = await api<DeletionRequest>('/users/me/deletion', { method: 'POST', body: JSON.stringify({ reason: deletionReason.value }) }); deletionMessage.value = '注销申请已提交' }
  catch (reason) { deletionMessage.value = reason instanceof Error ? reason.message : '注销申请失败' }
  finally { deletionBusy.value = false }
}
async function cancelAccountDeletion() {
  deletionBusy.value = true; deletionMessage.value = ''
  try { await api('/users/me/deletion', { method: 'DELETE' }); accountDeletion.value = null; deletionMessage.value = '注销申请已撤销' }
  catch (reason) { deletionMessage.value = reason instanceof Error ? reason.message : '撤销失败' }
  finally { deletionBusy.value = false }
}
function openCredentialEditor(item?: ApiCredential) {
  credentialError.value = ''
  credentialEditor.value = item
    ? { id: item.id, apiKey: '', apiKeyHint: item.apiKeyHint, enabled: item.enabled, isDefault: item.isDefault, priority: item.priority, weight: item.weight, expiresAt: item.expiresAt?.slice(0, 10) || '', autoImport: false }
    : { apiKey: '', apiKeyHint: '', enabled: true, isDefault: apiCredentials.value.length === 0, priority: 0, weight: 100, expiresAt: '', autoImport: true }
}

async function saveCredential() {
  if (!credentialEditor.value) return
  credentialSaving.value = true; credentialError.value = ''
  try {
    const { id, apiKeyHint: _hint, autoImport, ...payload } = credentialEditor.value
    if (!payload.apiKey) delete (payload as Partial<CredentialEditor>).apiKey
    const requestPayload = { ...payload, expiresAt: payload.expiresAt || null }
    const saved = await api<ApiCredential>(id ? `/users/me/api-credentials/${id}` : '/users/me/api-credentials', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(requestPayload) })
    credentialEditor.value = null
    if (autoImport) {
      try {
        const imported = await api<{ imported: number }>(`/users/me/api-credentials/${saved.id}/import-models`, { method: 'POST', body: JSON.stringify({ importAll: true }) })
        message.success(`已自动导入 ${imported.imported} 个可用模型`)
      } catch (reason) {
        message.warning(`密钥已保存，自动识别失败：${reason instanceof Error ? reason.message : '请稍后手动检测'}`)
      }
    }
    const [credentials, models] = await Promise.all([api<ApiCredential[]>('/users/me/api-credentials'), api<PrivateModel[]>('/users/me/private-models')])
    apiCredentials.value = credentials
    privateModels.value = models
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { credentialError.value = reason instanceof Error ? reason.message : 'API 密钥保存失败' }
  finally { credentialSaving.value = false }
}

async function provisionOnlyCodeCredential(group: string, name: string) {
  onlyCodeProvisioningBusyGroup.value = group
  try {
    const result = await api<{ imported: number; modelSyncError?: string }>('/users/me/api-credentials/only-code', { method: 'POST', body: JSON.stringify({ group, name: name.trim() || undefined }) })
    const [credentials, models] = await Promise.all([api<ApiCredential[]>('/users/me/api-credentials'), api<PrivateModel[]>('/users/me/private-models')])
    apiCredentials.value = credentials
    privateModels.value = models
    if (result.modelSyncError) message.warning(`已接入 ${group}，模型同步失败：${result.modelSyncError}`)
    else message.success(`已接入 ${group}，同步 ${result.imported} 个模型`)
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
    return true
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : 'OnlyCode 分组接入失败')
    return false
  } finally {
    onlyCodeProvisioningBusyGroup.value = ''
  }
}

async function deleteCredential(item: ApiCredential) {
  if (!window.confirm(`确认删除“${item.name}”？`)) return
  try {
    await api(`/users/me/api-credentials/${item.id}`, { method: 'DELETE' })
    const [credentials, models] = await Promise.all([
      api<ApiCredential[]>('/users/me/api-credentials'),
      api<PrivateModel[]>('/users/me/private-models'),
    ])
    apiCredentials.value = credentials
    privateModels.value = models
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { message.error(reason instanceof Error ? reason.message : 'API 密钥删除失败') }
}

async function discoverCredential(item: ApiCredential) {
  credentialCheckingId.value = item.id
  try {
    const imported = await api<{ imported: number; availableModels: string[] }>(`/users/me/api-credentials/${item.id}/import-models`, { method: 'POST', body: JSON.stringify({ importAll: true }) })
    discoveredCredentialModels.value = imported.availableModels
    const [credentials, models] = await Promise.all([api<ApiCredential[]>('/users/me/api-credentials'), api<PrivateModel[]>('/users/me/private-models')])
    apiCredentials.value = credentials
    privateModels.value = models
    message.success(`检测完成，已同步 ${imported.imported} 个模型`)
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) {
    const template = providerTemplates.value.find((entry) => entry.id === item.templateId)
    if (template && !template.supportsDiscovery) {
      discoveredCredentialModels.value = []
      openPrivateModelEditor(undefined, item.id)
      message.info('该渠道不提供模型列表，请手动填写模型 ID')
    } else message.error(reason instanceof Error ? reason.message : '密钥检测失败')
  } finally { credentialCheckingId.value = '' }
}

function openPrivateModelEditor(item?: PrivateModel, credentialId = '', upstreamModel = '') {
  privateModelError.value = ''
  privateModelEditor.value = item ? {
    id: item.id, displayName: item.displayName, description: item.description, capability: item.capability, apiProtocol: item.apiProtocol, routingStrategy: item.routingStrategy, enabled: item.enabled, isDefault: item.isDefault,
    routes: item.routes.map(({ credential: _credential, ...route }) => ({ ...route })),
  } : {
    id: '', displayName: upstreamModel, description: '', capability: 'CHAT', apiProtocol: 'openai', routingStrategy: 'PRIORITY', enabled: true, isDefault: false,
    routes: [{ credentialId: credentialId || apiCredentials.value[0]?.id || '', upstreamModel, enabled: true, priority: 0, weight: 100 }],
  }
}

async function savePrivateModel() {
  if (!privateModelEditor.value) return
  privateModelSaving.value = true
  privateModelError.value = ''
  try {
    const { id, routes, ...model } = privateModelEditor.value
    if (id) {
      await api(`/users/me/private-models/${id}`, { method: 'PATCH', body: JSON.stringify(model) })
      await api(`/users/me/private-models/${id}/routes`, { method: 'PUT', body: JSON.stringify({ routes }) })
    } else await api('/users/me/private-models', { method: 'POST', body: JSON.stringify({ ...model, routes }) })
    privateModels.value = await api<PrivateModel[]>('/users/me/private-models')
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
    privateModelEditor.value = null
  } catch (reason) { privateModelError.value = reason instanceof Error ? reason.message : '私有模型保存失败' }
  finally { privateModelSaving.value = false }
}

function hydrateSettings(value: UserSettingsResponse) {
  settings.appearance = value.appearance === 'light' ? '浅色' : value.appearance === 'system' ? '跟随系统' : '深色'
  settings.language = value.language || 'zh-CN'
  settings.style = value.responseStyle === 'default' ? '默认' : value.responseStyle || settings.style
  settings.detail = value.responseDetail === 'auto' ? '自动判断' : value.responseDetail || settings.detail
  settings.replyLanguage = value.replyLanguage === 'follow' ? '跟随对话' : value.replyLanguage || settings.replyLanguage
  settings.customInstructions = value.customInstructions || ''
  settings.nickname = value.nickname || ''
  settings.occupation = value.occupation || ''
  settings.bio = value.bio || ''
  settings.useMemory = value.useMemory ?? settings.useMemory
  settings.referenceChats = value.referenceChats ?? settings.referenceChats
  settings.notifications = value.notifications ?? settings.notifications
  settings.chatHistoryEnabled = value.chatHistoryEnabled ?? settings.chatHistoryEnabled
  settings.trainingOptOut = value.trainingOptOut ?? settings.trainingOptOut
  settings.temporaryChatDefault = value.temporaryChatDefault ?? settings.temporaryChatDefault
  settings.dataRetentionDays = value.dataRetentionDays ?? settings.dataRetentionDays
  settings.shareUsageAnalytics = value.shareUsageAnalytics ?? settings.shareUsageAnalytics
  if (!studio.currentConversationId) studio.temporaryChat = settings.temporaryChatDefault || !settings.chatHistoryEnabled
}

async function markAllRead() {
  if (!unreadCount.value) return
  await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined)
  const now = new Date().toISOString()
  notifications.value = notifications.value.map((item) => ({ ...item, readAt: item.readAt || now }))
}

async function submitModerationAppeal(item: ModerationCase) {
  const reason = (appealDrafts[item.id] || '').trim()
  if (reason.length < 10) return
  appealBusyId.value = item.id; appealMessage.value = ''; appealError.value = false
  try {
    await api(`/moderation/events/${item.id}/appeal`, { method: 'POST', body: JSON.stringify({ reason }) })
    moderationCases.value = await api<ModerationCase[]>('/moderation/cases')
    appealDrafts[item.id] = ''
    appealMessage.value = '申诉已提交，复核结果会通过站内通知发送。'
  } catch (error) {
    appealError.value = true; appealMessage.value = error instanceof Error ? error.message : '提交申诉失败'
  } finally { appealBusyId.value = '' }
}

async function cancelModerationAppeal(item: ModerationCase) {
  if (!item.appeal) return
  appealBusyId.value = item.id; appealMessage.value = ''; appealError.value = false
  try {
    await api(`/moderation/appeals/${item.appeal.id}/cancel`, { method: 'PATCH' })
    moderationCases.value = await api<ModerationCase[]>('/moderation/cases')
    appealMessage.value = '申诉已撤回。'
  } catch (error) {
    appealError.value = true; appealMessage.value = error instanceof Error ? error.message : '撤回申诉失败'
  } finally { appealBusyId.value = '' }
}

function handleConversationMenuOutside(event: PointerEvent) {
  if (!conversationMenuId.value || conversationMenuElement.value?.contains(event.target as Node)) return
  closeConversationMenu()
}

function handleConversationMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeConversationMenu()
}

async function exportAccountData() {
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try {
    const created = await api<{ id: string }>('/exports', { method: 'POST', body: JSON.stringify({ scope: 'ACCOUNT' }) })
    let status: { status: string; downloadUrl: string | null; error?: string } | null = null
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const current = await api<{ status: string; downloadUrl: string | null; error?: string }>(`/exports/${created.id}`)
      status = current
      if (current.status === 'SUCCEEDED' || current.status === 'FAILED' || current.status === 'EXPIRED') break
      dataActionMessage.value = attempt ? '正在准备账户数据…' : '已提交导出任务…'
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
    }
    const completed = status
    if (!completed || completed.status !== 'SUCCEEDED' || !completed.downloadUrl) throw new Error(completed?.error || '导出任务未完成，请稍后重试')
    const response = await fetch(apiUrl(completed.downloadUrl), { credentials: 'include' })
    if (!response.ok) throw new Error('导出文件下载失败')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = completed.downloadUrl.split('/').pop() || `xinyue-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    dataActionMessage.value = '账户数据已导出'
  } catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '数据导出失败' }
  finally { dataActionBusy.value = false }
}
async function clearConversationHistory() {
  if (!window.confirm('永久删除全部聊天记录？此操作无法撤销。')) return
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try { await studio.clearConversations(); dataActionMessage.value = '全部聊天记录已删除' }
  catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '聊天记录删除失败' }
  finally { dataActionBusy.value = false }
}

async function logout() {
  await auth.signOut()
  studio.clearWorkspace()
  accountOpen.value = false
  await router.push('/')
}
</script>
