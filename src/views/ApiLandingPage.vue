<template>
  <main class="api-landing" :class="{ 'is-dark': dark }">
    <header class="api-nav">
      <RouterLink class="api-brand" to="/"><span>X</span><strong>Xinyue AI</strong></RouterLink>
      <nav><a href="#top">{{ copy.home }}</a><a href="#console">{{ copy.console }}</a><a href="#models">{{ copy.models }}</a><a href="#docs">{{ copy.docs }}</a><a href="#about">{{ copy.about }}</a></nav>
      <div><button type="button" :aria-label="copy.language" :title="copy.language" @click="toggleLanguage"><Languages :size="19" /></button><button type="button" :aria-label="copy.theme" :title="copy.theme" @click="toggleTheme"><Sun v-if="!dark" :size="19" /><Moon v-else :size="19" /></button><button type="button" :aria-label="copy.notifications" :title="copy.notifications" @click="openNotifications"><Bell :size="19" /></button><RouterLink :to="auth.isAuthenticated ? '/chat' : '/login?redirect=/api'">{{ auth.isAuthenticated ? copy.workspace : copy.login }}</RouterLink></div>
    </header>

    <section id="top" class="api-hero">
      <div class="api-hero-copy">
        <span class="api-kicker"><CircleDot :size="13" />{{ copy.kicker }}</span>
        <h1>{{ copy.title }}<br /><em>{{ copy.titleAccent }}</em></h1>
        <p>{{ copy.description }}</p>
        <div class="api-hero-actions"><a class="is-primary" href="#console">{{ copy.start }}<ArrowRight :size="17" /></a><a href="#pricing">{{ copy.pricing }}</a><a href="#docs"><BookOpen :size="17" />{{ copy.docs }}</a></div>
        <div class="api-apps"><small>{{ copy.apps }}<br />{{ copy.appsDetail }}</small><div><span>Cherry Studio</span><span>CC Switch</span><span>{{ copy.more }}</span></div></div>
      </div>

      <section id="console" class="api-code-window">
        <header><nav><button v-for="tab in tabs" :key="tab" type="button" :class="{ 'is-active': activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></nav><span><i />200 OK</span></header>
        <div class="api-endpoint"><b>POST</b><code>{{ activeExample.endpoint }}</code></div>
        <div class="api-code-block"><strong>REQUEST</strong><pre>{{ activeExample.request }}</pre></div>
        <div class="api-code-block api-response"><strong>RESPONSE</strong><pre>{
  <span>"content"</span>: [{ "type": "text", "text": "Message routed." }],
  <span>"usage"</span>: { "input_tokens": 11, "output_tokens": 18 }
}</pre></div>
        <footer><span>156 MS</span><span>29 TOKENS</span><span>COST $0.00087</span><b>STREAM · SSE</b></footer>
      </section>
    </section>

    <section id="models" class="api-stats"><div><strong>50+</strong><span>{{ copy.upstreams }}</span></div><div><strong>100+</strong><span>{{ copy.billing }}</span></div><div><strong>50+</strong><span>{{ copy.routes }}</span></div><div><strong>10+</strong><span>{{ copy.scheduling }}</span></div></section>
    <section id="pricing" class="api-info-band"><div><span>01</span><h2>{{ copy.pricing }}</h2><p>{{ copy.pricingText }}</p></div><div><span>02</span><h2>{{ copy.docs }}</h2><p>{{ copy.docsText }}</p></div><div><span>03</span><h2>{{ copy.about }}</h2><p>{{ copy.aboutText }}</p></div></section>
    <section id="docs" class="api-anchor-section"><h2>{{ copy.docs }}</h2><code>POST /v1/chat/completions</code><code>POST /v1/images/generations</code><code>GET /v1/models</code></section>
    <section id="about" class="api-anchor-section"><h2>{{ copy.about }}</h2><p>{{ copy.aboutText }}</p></section>
    <footer class="api-footer"><span>© 2026 Xinyue AI</span><nav><RouterLink to="/about">{{ english ? 'About' : '关于我们' }}</RouterLink><RouterLink to="/copyright">{{ english ? 'Copyright' : '版权说明' }}</RouterLink><RouterLink to="/terms">{{ english ? 'Terms' : '用户协议' }}</RouterLink><RouterLink to="/privacy">{{ english ? 'Privacy' : '隐私政策' }}</RouterLink></nav></footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Bell, BookOpen, CircleDot, Languages, Moon, Sun } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { api } from '../services/api'
import { readStoredSettings, updateStoredSettings } from '../utils/settings-storage'

const tabs = ['Chat', 'Responses', 'Claude', 'Gemini']
const activeTab = ref('Claude')
const router = useRouter()
const auth = useAuthStore()
const saved = readStoredSettings()
const dark = ref(saved.appearance === '深色' || saved.appearance === 'dark')
const english = ref(saved.language === 'English' || saved.language === 'en')
const examples: Record<string, { endpoint: string; request: string }> = {
  Chat: { endpoint: '/v1/chat/completions', request: 'curl -X POST "/v1/chat/completions" \\\n  -H "Authorization: Bearer sk-••••" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"your-model","messages":[{"role":"user","content":"..."}]}\'' },
  Responses: { endpoint: '/v1/responses', request: 'curl -X POST "/v1/responses" \\\n  -H "Authorization: Bearer sk-••••" \\\n  -d \'{"model":"your-model","input":"Hello"}\'' },
  Claude: { endpoint: '/v1/messages', request: 'curl -X POST "/v1/messages" \\\n  -H "x-api-key: sk-••••" \\\n  -H "content-type: application/json" \\\n  -d \'{"model":"your-model","max_tokens":1024,"messages":[{"role":"user","content":"..."}]}\'' },
  Gemini: { endpoint: '/v1beta/models/gemini:generateContent', request: 'curl -X POST "/v1beta/models/gemini:generateContent" \\\n  -H "x-goog-api-key: sk-••••" \\\n  -d \'{"contents":[{"parts":[{"text":"Hello"}]}]}\'' },
}
const activeExample = computed(() => examples[activeTab.value])
const copy = computed(() => english.value ? {
  home: 'Home', console: 'Console', models: 'Models', docs: 'Docs', about: 'About', language: 'Switch language', theme: 'Switch theme', notifications: 'Notifications', workspace: 'Workspace', login: 'Sign in', kicker: 'AI application infrastructure', title: 'One API gateway for', titleAccent: 'every AI model', description: 'Connect models through one standard protocol, operate AI applications, and manage digital assets efficiently.', start: 'Get started', pricing: 'Pricing', apps: 'Popular clients', appsDetail: 'One-click configuration across common protocols', more: 'More', upstreams: 'Provider adapters', billing: 'Billing models', routes: 'Compatible routes', scheduling: 'Scheduling controls', pricingText: 'Usage-based billing with credits, quotas, and auditable ledgers.', docsText: 'OpenAI, Claude, Gemini, and Responses-compatible request examples.', aboutText: 'A commercial API gateway for the Xinyue AI workspace.',
} : {
  home: '主页', console: '控制台', models: '模型广场', docs: '文档', about: '关于', language: '更改语言', theme: '切换主题', notifications: '通知', workspace: '进入工作台', login: '登录', kicker: '人工智能应用基座', title: '统一 API 网关', titleAccent: '连接海量 AI 模型', description: '通过统一、标准的接口协议接入海量模型。承载 AI 应用，高效管理数字资产，连接未来。', start: '开始使用', pricing: '查看定价', apps: '常用应用支持', appsDetail: '支持一键配置并兼容多种协议', more: '更多', upstreams: '上游服务适配', billing: '模型计费支持', routes: '兼容 API 路由', scheduling: '调度控制能力', pricingText: '按量计费，并提供创作点、额度和可审计流水。', docsText: '提供 OpenAI、Claude、Gemini 与 Responses 兼容请求示例。', aboutText: 'Xinyue AI 工作台的商业 API 网关界面。',
})

function persist() {
  const serverSettings = { appearance: dark.value ? 'dark' : 'light', language: english.value ? 'en' : 'zh-CN' }
  const next = updateStoredSettings((current) => ({
    ...current,
    appearance: dark.value ? '深色' : '浅色',
    language: serverSettings.language,
    pendingServerSync: { ...serverSettings, changedAt: Date.now() },
  }))
  document.documentElement.lang = english.value ? 'en' : 'zh-CN'
  if (auth.session?.id) {
    void api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(serverSettings) }).then(() => {
      updateStoredSettings((current) => current.pendingServerSync?.changedAt === next.pendingServerSync?.changedAt
        ? { ...current, pendingServerSync: undefined }
        : current)
    }).catch(() => undefined)
  }
}
function toggleLanguage() { english.value = !english.value; persist() }
function toggleTheme() { dark.value = !dark.value; persist() }
function openNotifications() { void router.push(auth.isAuthenticated ? '/chat?settings=notifications' : '/login?redirect=/chat%3Fsettings%3Dnotifications') }
onMounted(() => void auth.refresh())
</script>
