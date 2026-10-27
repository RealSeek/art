<template>
  <main class="login-page">
    <section class="login-panel">
      <header class="login-header">
        <RouterLink class="login-brand login-brand--compact" to="/">
          <span class="login-brand__mark">O</span>
          <strong>OnlyArt</strong>
        </RouterLink>
        <div class="login-header__tools">
          <select v-model="locale" class="login-locale-select" aria-label="Language">
            <option value="zh-CN">简中</option>
            <option value="zh-TW">繁中</option>
            <option value="en">EN</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
          <span class="login-account-pill"><ShieldCheck :size="14" />OnlyCode 账户</span>
        </div>
      </header>

      <section class="login-card" aria-live="polite">
        <div v-if="!catalog.loaded || catalog.loading" class="auth-step auth-step--availability auth-step--loading">
          <LoaderCircle class="is-spinning" :size="22" />
        </div>
        <div v-else-if="catalog.loadError" class="auth-step auth-step--availability">
          <div class="login-heading">
            <h1>暂时无法连接服务</h1>
            <p>{{ catalog.loadError }}</p>
          </div>
          <button class="button button--solid login-submit" type="button" @click="catalog.load(true)">
            <RotateCcw :size="17" />重新加载
          </button>
        </div>
        <div v-else-if="!catalog.newApiLoginReady" class="auth-step auth-step--availability">
          <div class="login-heading">
            <h1>登录暂未开放</h1>
            <p>管理员尚未完成 OnlyCode 登录配置。</p>
          </div>
          <RouterLink class="button button--solid login-submit" to="/chat">返回工作台</RouterLink>
        </div>
        <div v-else class="auth-step auth-step--multi">
          <span class="login-card__badge" aria-hidden="true"><span>O</span></span>
          <div class="login-heading">
            <h1>欢迎回来</h1>
            <p>使用现有 OnlyCode 账户继续，无需单独注册 OnlyArt 账户。</p>
          </div>
          <p v-if="error" class="login-error" role="alert">{{ error }}</p>
          <a class="button button--solid login-submit" :href="newApiLoginUrl">使用OnlyCode账号进行登录<ArrowRight :size="17" /></a>
          <p class="login-card__note">将跳转到 OnlyCode 完成授权，完成后自动返回 OnlyArt。</p>
        </div>
      </section>

      <p class="login-legal">
        <span>继续即表示你同意 OnlyArt 的用户协议和隐私政策。</span>
        <span class="login-legal__links">
          <RouterLink to="/terms">用户协议</RouterLink><i>·</i><RouterLink to="/privacy">隐私政策</RouterLink>
        </span>
      </p>
    </section>

    <aside class="login-showcase">
      <RouterLink class="login-brand" to="/">
        <span class="login-brand__mark">O</span>
        <strong>OnlyArt</strong>
        <span class="login-brand__tag">OnlyCode 家族</span>
      </RouterLink>
      <div class="login-showcase__body">
        <p class="login-showcase__eyebrow"><Sparkles :size="14" />AI 创作工作台</p>
        <p class="login-showcase__title">灵感不再断层，<br />从对话推演到整套创作交付</p>
        <p class="login-showcase__lead">对话、图片、视频、画布与电商套图，在同一个工作台里完成。</p>
        <ul class="login-showcase__points">
          <li><ShieldCheck :size="16" /><span>一个 OnlyCode 账户，两站通行</span></li>
          <li><Layers :size="16" /><span>从灵感到成片，素材与记录集中管理</span></li>
          <li><Sparkles :size="16" /><span>按需切换模型，图片与视频一处生成</span></li>
        </ul>
      </div>
      <div class="login-showcase__stage" aria-hidden="true">
        <span class="login-showcase__tile login-showcase__tile--a"><i>对话</i></span>
        <span class="login-showcase__tile login-showcase__tile--b"><i>图片</i></span>
        <span class="login-showcase__tile login-showcase__tile--c"><i>视频</i></span>
        <span class="login-showcase__prompt"><b></b>描述你的创作目标…<em>生成</em></span>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Layers, LoaderCircle, RotateCcw, ShieldCheck, Sparkles } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { apiUrl } from '../services/api'
import { updateStoredSettings } from '../utils/settings-storage'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const catalog = useCatalogStore()
const { locale } = useI18n()

const redirectPath = computed(() =>
  typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
    ? route.query.redirect
    : '/chat',
)
const newApiLoginUrl = computed(() => apiUrl(`/auth/new-api/start?redirect=${encodeURIComponent(redirectPath.value)}`))
const error = computed(() => route.query.error === 'new-api' ? 'OnlyCode 登录失败，请重试。' : '')

onMounted(async () => {
  await catalog.load()
  await auth.refresh()
  if (auth.isAuthenticated) await router.replace(redirectPath.value)
})

watch(locale, (value) => {
  document.documentElement.lang = value
  updateStoredSettings((stored) => ({ ...stored, language: value }))
})
</script>
