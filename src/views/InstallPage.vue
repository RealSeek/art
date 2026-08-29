<template>
  <main class="install-page">
    <section class="install-card" aria-live="polite">
      <div class="install-brand"><span class="install-mark">X</span><strong>Xinyue AI</strong></div>
      <template v-if="loading"><p class="install-muted">正在检查初始化状态...</p></template>
      <template v-else-if="!required">
        <h1>系统已完成初始化</h1>
        <p class="install-muted">管理员账户已经存在，初始化入口已关闭。</p>
        <a class="install-button" href="/admin/">进入管理后台</a>
      </template>
      <template v-else>
        <h1>初始化管理员</h1>
        <p class="install-muted">首次启动请创建管理员账户。完成后此页面将自动关闭。</p>
        <form @submit.prevent="submit">
          <label>管理员邮箱<input v-model.trim="email" type="email" autocomplete="email" required /></label>
          <label>管理员密码<input v-model="password" type="password" autocomplete="new-password" minlength="8" required /></label>
          <label>确认密码<input v-model="confirm" type="password" autocomplete="new-password" minlength="8" required /></label>
          <p v-if="error" class="install-error" role="alert">{{ error }}</p>
          <button class="install-button" type="submit" :disabled="busy">{{ busy ? '正在创建...' : '创建管理员' }}</button>
        </form>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '../services/api'

const loading = ref(true)
const required = ref(false)
const busy = ref(false)
const email = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')

onMounted(async () => {
  try { required.value = Boolean((await api<{ required: boolean }>('/auth/setup/status')).required) }
  catch (reason) { error.value = reason instanceof ApiError ? reason.message : '无法连接服务' }
  finally { loading.value = false }
})

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) { error.value = '两次输入的密码不一致'; return }
  busy.value = true
  try {
    await api('/auth/setup', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) })
    window.location.assign('/admin/')
  } catch (reason) { error.value = reason instanceof ApiError ? reason.message : '初始化失败' }
  finally { busy.value = false }
}
</script>

<style scoped>
.install-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f5f7fb; color: #1f2937; }
.install-card { width: min(420px, 100%); padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; box-shadow: 0 12px 36px rgba(15, 23, 42, .08); }
.install-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; font-size: 20px; }
.install-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: #397157; color: #fff; font-weight: 700; }
h1 { margin: 0 0 8px; font-size: 24px; }
.install-muted { margin: 0 0 22px; color: #6b7280; line-height: 1.6; }
form { display: grid; gap: 16px; }
label { display: grid; gap: 7px; font-size: 14px; font-weight: 600; }
input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font: inherit; }
input:focus { outline: 2px solid #397157; outline-offset: 1px; }
.install-button { display: inline-flex; justify-content: center; align-items: center; width: 100%; box-sizing: border-box; padding: 11px 16px; border: 0; border-radius: 6px; background: #397157; color: #fff; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.install-button:disabled { opacity: .6; cursor: wait; }
.install-error { margin: 0; color: #b42318; font-size: 14px; }
</style>
