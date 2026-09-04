<template>
  <main class="api-landing" :class="{ 'is-dark': dark }">
    <header class="api-nav">
      <RouterLink class="api-brand" to="/"><span>O</span><strong>OnlyArt</strong></RouterLink>
      <nav><a href="#top">{{ copy.home }}</a><a href="#console">{{ copy.console }}</a><a href="#about">{{ copy.about }}</a></nav>
      <div><button type="button" :aria-label="copy.language" :title="copy.language" @click="toggleLanguage"><Languages :size="19" /></button><button type="button" :aria-label="copy.theme" :title="copy.theme" @click="toggleTheme"><Sun v-if="!dark" :size="19" /><Moon v-else :size="19" /></button><button type="button" :aria-label="copy.notifications" :title="copy.notifications" @click="openNotifications"><Bell :size="19" /></button><RouterLink :to="auth.isAuthenticated ? '/chat' : '/login?redirect=/api'">{{ auth.isAuthenticated ? copy.workspace : copy.login }}</RouterLink></div>
    </header>

    <section id="top" class="api-hero">
      <div class="api-hero-copy">
        <span class="api-kicker"><CircleDot :size="13" />{{ copy.kicker }}</span>
        <h1>{{ copy.title }}<br /><em>{{ copy.titleAccent }}</em></h1>
        <p>{{ copy.description }}</p>
        <div class="api-hero-actions"><a v-if="apiEntries.length" class="is-primary" href="#console">{{ copy.start }}<ArrowRight :size="17" /></a><RouterLink v-else class="is-primary" to="/chat">{{ copy.workspace }}<ArrowRight :size="17" /></RouterLink><RouterLink to="/commerce">{{ copy.pricing }}</RouterLink></div>
        <div class="api-apps"><small>{{ copy.apps }}<br />{{ copy.appsDetail }}</small><div><span v-for="entry in apiEntries.slice(0, 3)" :key="entry.id">{{ entry.name }}</span><span v-if="!apiEntries.length">{{ copy.unavailable }}</span></div></div>
      </div>

      <section id="console" class="api-code-window">
        <header><nav><strong>{{ copy.console }}</strong></nav><span :class="{ 'api-entry-status--ready': apiEntries.length }"><i />{{ apiEntries.length ? copy.ready : copy.unavailable }}</span></header>
        <div v-if="apiEntries.length" class="api-entry-list">
          <a v-for="entry in apiEntries" :key="entry.id" :href="entry.url" :target="entry.openNewTab ? '_blank' : undefined" :rel="entry.openNewTab ? 'noopener noreferrer' : undefined"><span><strong>{{ entry.name }}</strong><small>{{ entry.description || copy.entryFallback }}</small></span><code>{{ entry.url }}</code><ArrowRight :size="17" /></a>
        </div>
        <div v-else class="api-entry-empty"><BookOpen :size="25" /><strong>{{ copy.emptyTitle }}</strong><p>{{ copy.emptyText }}</p></div>
        <footer><span>{{ copy.configuredByAdmin }}</span><b>{{ apiEntries.length ? `${apiEntries.length} ${copy.entries}` : copy.noEntry }}</b></footer>
      </section>
    </section>

    <section class="api-info-band"><div><span>01</span><h2>{{ copy.pricing }}</h2><p>{{ copy.pricingText }}</p></div><div><span>02</span><h2>{{ copy.console }}</h2><p>{{ copy.entryText }}</p></div><div><span>03</span><h2>{{ copy.about }}</h2><p>{{ copy.aboutText }}</p></div></section>
    <section id="about" class="api-anchor-section"><h2>{{ copy.about }}</h2><p>{{ copy.aboutText }}</p></section>
    <footer class="api-footer"><span>© 2026 OnlyArt</span><nav><RouterLink to="/about">{{ english ? 'About' : '关于我们' }}</RouterLink><RouterLink to="/copyright">{{ english ? 'Copyright' : '版权说明' }}</RouterLink><RouterLink to="/terms">{{ english ? 'Terms' : '用户协议' }}</RouterLink><RouterLink to="/privacy">{{ english ? 'Privacy' : '隐私政策' }}</RouterLink></nav></footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Bell, BookOpen, CircleDot, Languages, Moon, Sun } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { api } from '../services/api'
import { readStoredSettings, updateStoredSettings } from '../utils/settings-storage'

type ExternalApiEntry = { id: string; key: string; name: string; description: string; url: string; openNewTab: boolean }

const router = useRouter()
const auth = useAuthStore()
const saved = readStoredSettings()
const dark = ref(saved.appearance === '深色' || saved.appearance === 'dark')
const english = ref(saved.language === 'English' || saved.language === 'en')
const apiEntries = ref<ExternalApiEntry[]>([])
const copy = computed(() => english.value ? {
  home: 'Home', console: 'API access', about: 'About', language: 'Switch language', theme: 'Switch theme', notifications: 'Notifications', workspace: 'Workspace', login: 'Sign in', kicker: 'AI service access', title: 'Configured access for', titleAccent: 'your AI services', description: 'API access is supplied through administrator-configured services. Choose an available entry to continue.', start: 'Open API service', pricing: 'Pricing', apps: 'Available services', appsDetail: 'Entries are managed by the workspace administrator', unavailable: 'No API service configured', ready: 'Available', entryFallback: 'Open the configured service', emptyTitle: 'API access is not configured', emptyText: 'An administrator can add an API service from the management console.', configuredByAdmin: 'Managed by administrator', entries: 'entries', noEntry: 'No entry', pricingText: 'Subscriptions, credits, and purchases are managed in the workspace.', entryText: 'Configured API services open from this page without claiming unsupported local routes.', aboutText: 'OnlyArt provides a workspace for AI creation and configured service access.',
} : {
  home: '主页', console: 'API 服务', about: '关于', language: '更改语言', theme: '切换主题', notifications: '通知', workspace: '进入工作台', login: '登录', kicker: 'AI 服务接入', title: '面向已配置的', titleAccent: 'AI 服务入口', description: 'API 服务由管理员在后台配置。请选择可用入口继续，不再展示未部署的本地接口。', start: '打开 API 服务', pricing: '查看定价', apps: '可用服务', appsDetail: '入口由工作台管理员统一管理', unavailable: '暂未配置 API 服务', ready: '可用', entryFallback: '打开已配置的服务', emptyTitle: '暂未配置 API 服务', emptyText: '管理员可在管理端的“外部入口”中添加 API 服务地址。', configuredByAdmin: '由管理员配置', entries: '个入口', noEntry: '无可用入口', pricingText: '订阅、创作点和购买记录统一在工作台中管理。', entryText: '本页只打开管理员配置的 API 服务，不再宣称未部署的本地兼容接口。', aboutText: 'OnlyArt 提供 AI 创作工作台和管理员配置的服务接入。',
})

function persist() {
  const serverSettings = { appearance: dark.value ? 'dark' : 'light', language: english.value ? 'en' : 'zh-CN' }
  const next = updateStoredSettings((current) => ({ ...current, appearance: dark.value ? '深色' : '浅色', language: serverSettings.language, pendingServerSync: { ...serverSettings, changedAt: Date.now() } }))
  document.documentElement.lang = english.value ? 'en' : 'zh-CN'
  if (!auth.session?.id) return
  void api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(serverSettings) }).then(() => {
    updateStoredSettings((current) => current.pendingServerSync?.changedAt === next.pendingServerSync?.changedAt ? { ...current, pendingServerSync: undefined } : current)
  }).catch(() => undefined)
}

function toggleLanguage() { english.value = !english.value; persist() }
function toggleTheme() { dark.value = !dark.value; persist() }
function openNotifications() { void router.push(auth.isAuthenticated ? '/chat?settings=notifications' : '/login?redirect=/chat%3Fsettings%3Dnotifications') }

onMounted(async () => {
  await auth.refresh()
  const entries = await api<ExternalApiEntry[]>('/catalog/external-links').catch(() => [])
  apiEntries.value = entries.filter((entry) => /^api(?:[-_].*)?$/i.test(entry.key))
})
</script>
