<template>
  <main class="login-page">
    <section class="login-panel">
      <header class="login-header">
        <RouterLink class="login-brand" to="/">
          <span class="login-brand__mark">O</span>
          <strong>ONLYART</strong>
          <i></i>
          <span>AI</span>
        </RouterLink>
        <div class="login-header__tools">
          <select v-model="locale" class="login-locale-select" aria-label="Language">
            <option value="zh-CN">简中</option>
            <option value="zh-TW">繁中</option>
            <option value="en">EN</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
          <span class="login-account-pill">OnlyCode 账户</span>
        </div>
      </header>

      <section class="login-form" aria-live="polite">
        <div v-if="!catalog.loaded || catalog.loading" class="auth-step auth-step--availability">
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
          <div class="login-heading">
            <h1>欢迎回来</h1>
            <p>使用现有 OnlyCode 账户继续，无需单独注册 OnlyArt 账户。</p>
          </div>
          <p v-if="error" class="login-error" role="alert">{{ error }}</p>
          <a class="button button--solid login-submit" :href="newApiLoginUrl">使用OnlyCode账号进行登录</a>
        </div>
      </section>

      <p class="login-legal">
        <span>继续即表示你同意 OnlyArt 的用户协议和隐私政策。</span>
        <span class="login-legal__links">
          <RouterLink to="/terms">用户协议</RouterLink><i>·</i><RouterLink to="/privacy">隐私政策</RouterLink>
        </span>
      </p>
    </section>

    <aside class="login-visual" aria-hidden="true">
      <div class="login-particles">
        <i v-for="index in 18" :key="index" :style="particleStyle(index)"></i>
      </div>
      <div class="login-visual__mark"><span>O</span></div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { LoaderCircle, RotateCcw } from 'lucide-vue-next'
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

function particleStyle(index: number) {
  return {
    left: `${(index * 37) % 96}%`,
    top: `${(index * 53) % 94}%`,
    width: `${2 + (index % 3)}px`,
    height: `${2 + (index % 3)}px`,
    animationDelay: `${(index * 0.47) % 7}s`,
    animationDuration: `${14 + (index % 7) * 2}s`,
  }
}

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
