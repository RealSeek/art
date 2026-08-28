<template>
  <button
    v-if="mobileOpen"
    class="workspace-backdrop"
    type="button"
    aria-label="关闭菜单"
    @click="mobileOpen = false"
  />

  <aside class="workspace-sidebar" :class="{ 'is-mobile-open': mobileOpen }">
    <div class="workspace-sidebar__top">
      <BrandMark to="/chat" dark :compact="!sidebarOpen" />
      <button class="icon-button sidebar-close" type="button" aria-label="关闭边栏" @click="sidebarOpen = !sidebarOpen">
        <PanelLeftClose :size="18" />
      </button>
      <button class="icon-button mobile-close" type="button" aria-label="关闭菜单" @click="mobileOpen = false">
        <X :size="19" />
      </button>
    </div>

    <div class="workspace-sidebar__scroll" @scroll="closeConversationMenu">
    <nav class="workspace-menu" aria-label="工作台导航">
      <a
        v-for="item in navItems"
        :key="item.key"
        :href="item.to"
        :target="item.external && item.openNewTab ? '_blank' : undefined"
        :rel="item.external && item.openNewTab ? 'noreferrer' : undefined"
        class="workspace-menu__item"
        :class="{ 'is-active': !item.external && (item.activeModes || [item.mode]).includes(activeMode) && (item.mode !== 'chat' || !studio.currentConversationId) }"
        :title="!sidebarOpen ? item.label : undefined"
        @click="handleNavLink($event, item)"
      >
        <component :is="item.icon" :size="19" />
        <span>{{ item.label }}</span>
      </a>
    </nav>

    <section v-if="auth.isAuthenticated" class="workspace-recent" :class="{ 'is-collapsed': !sidebarOpen }">
      <button v-if="!sidebarOpen" class="workspace-recent-collapsed" type="button" aria-label="打开最近对话" title="打开最近对话" @click="sidebarOpen = true"><History :size="19" /></button>
      <template v-else>
      <header class="workspace-recent__header"><button class="workspace-recent__toggle" type="button" :aria-expanded="recentOpen" @click="recentOpen = !recentOpen">{{ t('workspace.recent') }} <ChevronDown :size="14" :class="{ 'is-up': recentOpen }" /></button><button class="workspace-recent__search-button" type="button" aria-label="搜索对话" title="搜索对话" @click="recentSearchOpen = !recentSearchOpen; recentOpen = true"><Search :size="15" /></button></header>
      <div v-if="recentOpen" class="workspace-recent__body">
        <label v-if="recentSearchOpen" class="workspace-recent__search-field"><Search :size="14" /><input v-model="conversationSearch" aria-label="搜索对话" placeholder="搜索对话" /></label>
        <div v-for="conversation in visibleRecentConversations" :key="conversation.id" class="workspace-recent-row" :class="{ 'is-active': activeMode === 'chat' && conversation.id === studio.currentConversationId }">
          <form v-if="renamingConversationId === conversation.id" class="workspace-recent-rename" @submit.prevent="saveConversationRename(conversation.id)">
            <input v-model="conversationRename" maxlength="120" aria-label="对话名称" autofocus :disabled="conversationRenameBusy" @keydown.esc="cancelConversationRename" />
            <button type="submit" aria-label="保存重命名" title="保存" :disabled="conversationRenameBusy || !conversationRename.trim()"><LoaderCircle v-if="conversationRenameBusy" :size="14" /><Check v-else :size="14" /></button>
            <button type="button" aria-label="取消重命名" title="取消" :disabled="conversationRenameBusy" @click="cancelConversationRename"><X :size="14" /></button>
          </form>
          <template v-else>
            <button class="workspace-recent-item" type="button" :title="conversation.title" @click="openConversation(conversation.id)" @dblclick.prevent="startConversationRename(conversation)">{{ conversation.title }}</button>
            <span v-if="conversation.pinnedAt" class="workspace-recent-pin" :title="`已置顶：${conversation.title}`"><Pin :size="12" /></span>
            <button class="workspace-recent-edit" type="button" :aria-label="`重命名“${conversation.title}”`" title="重命名" @click.stop="startConversationRename(conversation)"><Pencil :size="14" /></button>
            <button class="workspace-recent-more" type="button" :aria-label="`打开“${conversation.title}”的对话选项`" :aria-expanded="conversationMenuId === conversation.id" @click.stop="openConversationMenu($event, conversation)"><MoreHorizontal :size="17" /></button>
          </template>
        </div>
        <p v-if="studio.workspaceHydrating && !studio.conversations.length">正在加载对话...</p>
        <p v-else-if="!filteredConversations.length">{{ conversationSearch ? '没有匹配的对话' : t('workspace.noChats') }}</p>
        <button v-else-if="hasMoreRecentConversations" class="workspace-recent-show-more" type="button" @click="recentVisibleCount += recentConversationPageSize">显示更多（剩余 {{ filteredConversations.length - visibleRecentConversations.length }} 条）</button>
      </div>
      </template>
    </section>
    </div>

    <div class="workspace-sidebar__bottom">
      <button v-if="workspaceDataLoaded && auth.isAuthenticated && publicSettings.trialEnabled && !currentSubscription && activeMode !== 'chat'" class="workspace-trial-button" type="button" @click="openSettings('plan')"><Gift :size="17" /><span>免费试用</span></button>
      <button v-if="!auth.isAuthenticated" class="workspace-settings" type="button" title="设置" @click="showSettings">
        <Settings :size="19" />
        <span>{{ t('workspace.settings') }}</span>
      </button>

      <section v-if="!auth.isAuthenticated && catalog.loginEnabled" class="workspace-signin">
        <strong>获取为你量身定制的回复</strong>
        <p>登录后可保存对话、创建图片并上传文件。</p>
        <RouterLink class="workspace-signin__button" to="/login?redirect=/chat">{{ t('workspace.signIn') }}</RouterLink>
      </section>
      <section v-if="auth.isAuthenticated" class="workspace-account-wrap">
        <button class="workspace-account-button" type="button" :aria-expanded="accountOpen" @click="accountOpen = !accountOpen">
          <span class="workspace-avatar">{{ auth.initials }}</span>
          <span class="workspace-account-copy">
            <strong>{{ auth.displayName }}</strong>
            <small>{{ currentPlanName }}</small>
          </span>
          <ChevronUp :size="16" :class="{ 'is-down': !accountOpen }" />
        </button>
        <div v-if="accountOpen" class="workspace-account-menu">
          <div class="account-menu-heading"><span class="workspace-avatar">{{ auth.initials }}</span><span><strong>{{ auth.displayName }}</strong><small>{{ currentPlanName }}</small></span></div>
          <div class="account-credit"><span>创作点余额</span><strong><Sparkles :size="13" />{{ studio.credits }}</strong></div>
          <button type="button" @click="openUpgrade"><Sparkles :size="16" />{{ currentSubscription ? '查看升级方案' : '升级套餐' }}</button>
          <button type="button" @click="openSettings('teams')"><Users :size="16" />团队空间</button>
          <button type="button" @click="openSettings('support')"><LifeBuoy :size="16" />帮助与客服</button>
          <button type="button" @click="openSettings('personalization')">{{ t('workspace.personalization') }}</button>
          <button type="button" @click="openSettings('account')">{{ t('workspace.account') }}</button>
          <button type="button" @click="openSettings('general')">{{ t('workspace.settings') }}</button>
          <button class="account-logout" type="button" @click="logout"><LogOut :size="17" />{{ t('workspace.logout') }}</button>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Blocks,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  ExternalLink,
  FolderKanban,
  Gift,
  History,
  KeyRound,
  LibraryBig,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  SquarePen,
  Users,
  Webhook,
  X,
  Image as ImageIcon,
} from 'lucide-vue-next'
import BrandMark from '../BrandMark.vue'
import type { ConversationSummary, StudioMode } from '../../types'
import { useAuthStore } from '../../stores/auth'
import { useCatalogStore } from '../../stores/catalog'
import { useStudioStore } from '../../stores/studio'
import type {
  ExternalNavLinkItem,
  PublicSettings,
  SettingsSection,
  Subscription,
  WorkspaceNavItem,
  WorkspaceSettings,
} from './types'

const props = defineProps<{
  activeMode: StudioMode
  settings: WorkspaceSettings
  publicSettings: PublicSettings
  externalLinks: ExternalNavLinkItem[]
  workspaceDataLoaded: boolean
  currentSubscription: Subscription | null
  conversationMenuPosition: { left: number; top: number }
  renamingConversationId: string
  conversationRenameBusy: boolean
  openSettings: (section: SettingsSection) => void
  showSettings: () => void
  openUpgrade: () => void
  logout: () => Promise<void>
  closeConversationMenu: () => void
  startConversationRename: (conversation: { id: string; title: string }) => void
  saveConversationRename: (conversationId: string) => Promise<void>
  cancelConversationRename: () => void
}>()

const sidebarOpen = defineModel<boolean>('sidebarOpen', { required: true })
const mobileOpen = defineModel<boolean>('mobileOpen', { required: true })
const accountOpen = defineModel<boolean>('accountOpen', { required: true })
const conversationMenuId = defineModel<string>('conversationMenuId', { required: true })
const conversationRename = defineModel<string>('conversationRename', { required: true })

const auth = useAuthStore()
const catalog = useCatalogStore()
const studio = useStudioStore()
const router = useRouter()
const { t } = useI18n()

const recentOpen = ref(true)
const recentSearchOpen = ref(false)
const conversationSearch = ref('')
const recentConversationPageSize = 30
const recentVisibleCount = ref(recentConversationPageSize)

const filteredConversations = computed(() => {
  const query = conversationSearch.value.trim().toLocaleLowerCase()
  if (!query) return studio.conversations
  return studio.conversations.filter((item) => item.title.toLocaleLowerCase().includes(query))
})
const visibleRecentConversations = computed(() => filteredConversations.value.slice(0, recentVisibleCount.value))
const hasMoreRecentConversations = computed(() => visibleRecentConversations.value.length < filteredConversations.value.length)
watch(conversationSearch, () => { recentVisibleCount.value = recentConversationPageSize })

const currentPlanName = computed(() => props.currentSubscription?.plan.name || '免费版')

const externalIconMap: Record<string, Component> = { code: Code2, 'book-open': BookOpen, webhook: Webhook, 'key-round': KeyRound, 'life-buoy': LifeBuoy, 'external-link': ExternalLink }
const navItems = computed<WorkspaceNavItem[]>(() => [
  { key: 'chat', mode: 'chat', label: t('workspace.newChat'), icon: SquarePen, to: '/chat', external: false, openNewTab: false },
  ...(props.publicSettings.sidebarCreationEnabled ? [{ key: 'creation', mode: 'images' as const, activeModes: ['images', 'videos'] as StudioMode[], label: t('workspace.creation'), icon: ImageIcon, to: '/image', external: false, openNewTab: false }] : []),
  ...(props.publicSettings.sidebarCommerceEnabled ? [{ key: 'commerce', mode: 'commerce' as const, label: t('workspace.commerce'), icon: ShoppingBag, to: '/commerce', external: false, openNewTab: false }] : []),
  ...(props.publicSettings.sidebarOfficeEnabled ? [{ key: 'office', mode: 'office' as const, label: t('workspace.office'), icon: BriefcaseBusiness, to: '/office', external: false, openNewTab: false }] : []),
  ...(props.publicSettings.sidebarPromptsEnabled ? [{ key: 'prompts', mode: 'prompts' as const, label: t('workspace.prompts'), icon: LibraryBig, to: '/prompts', external: false, openNewTab: false }] : []),
  ...(props.publicSettings.sidebarPluginsEnabled ? [{ key: 'plugins', mode: 'plugins' as const, label: '能力中心', icon: Blocks, to: '/capabilities', external: false, openNewTab: false }] : []),
  ...(props.publicSettings.sidebarProjectsEnabled || props.publicSettings.sidebarAssetsEnabled ? [{ key: 'workspace', mode: 'workspace' as const, label: '工作空间', icon: FolderKanban, to: '/workspace', external: false, openNewTab: false }] : []),
  ...props.externalLinks.map((item) => ({ key: `external-${item.key}`, mode: 'api' as const, label: item.name, icon: externalIconMap[item.icon] || ExternalLink, to: item.url, external: true, openNewTab: item.openNewTab })),
])

function handleNav(mode: StudioMode) {
  mobileOpen.value = false
  if (mode === 'chat') studio.newConversation(props.settings.temporaryChatDefault || !props.settings.chatHistoryEnabled)
}

function handleNavLink(event: MouseEvent, item: WorkspaceNavItem) {
  if (item.external) return
  event.preventDefault()
  handleNav(item.mode)
  void router.push(item.to)
}

async function openConversation(conversationId: string) {
  mobileOpen.value = false
  const loading = studio.openConversation(conversationId).catch(() => undefined)
  await router.push('/chat')
  await loading
  if (studio.currentConversationId === conversationId) void studio.resumeCurrentChat()
}

function openConversationMenu(event: MouseEvent, conversation: ConversationSummary) {
  if (conversationMenuId.value === conversation.id) {
    props.closeConversationMenu()
    return
  }
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 144
  const menuHeight = 200
  const viewportGap = 8
  const fitsBelow = rect.bottom + menuHeight - 4 <= window.innerHeight - viewportGap
  props.conversationMenuPosition.left = Math.min(window.innerWidth - menuWidth - viewportGap, Math.max(viewportGap, rect.left - 8))
  props.conversationMenuPosition.top = fitsBelow
    ? rect.bottom - 4
    : Math.max(viewportGap, rect.top - menuHeight + 4)
  conversationMenuId.value = conversation.id
}
</script>
