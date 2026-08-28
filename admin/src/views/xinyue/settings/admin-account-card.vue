<template>
  <ElCard shadow="never" class="account-card">
    <template #header>
      <div class="card-title"
        ><strong>{{ xt('管理员账户') }}</strong
        ><ElTag type="info">{{ accountEmail || xt('未读取') }}</ElTag></div
      >
    </template>
    <ElAlert
      :title="xt('修改邮箱或密码后，其他已登录设备会被退出；当前设备保持登录。')"
      type="info"
      :closable="false"
      show-icon
    />
    <div class="account-forms">
      <ElForm label-position="top" @submit.prevent>
        <ElDivider content-position="left">{{ xt('修改邮箱') }}</ElDivider>
        <ElFormItem :label="xt('新管理员邮箱')" required
          ><ElInput
            v-model.trim="accountEmailDraft"
            type="email"
            autocomplete="email"
            :placeholder="xt('请输入新的管理员邮箱')"
        /></ElFormItem>
        <ElFormItem :label="xt('当前密码')" required
          ><ElInput
            v-model="accountEmailPassword"
            type="password"
            show-password
            autocomplete="current-password"
            :placeholder="xt('用于确认身份')"
        /></ElFormItem>
        <ElButton
          type="primary"
          :loading="accountBusy === 'email'"
          :disabled="!accountEmailDraft || !accountEmailPassword"
          @click="saveAdminEmail"
          >{{ xt('保存邮箱') }}</ElButton
        >
      </ElForm>
      <ElForm label-position="top" @submit.prevent>
        <ElDivider content-position="left">{{ xt('修改密码') }}</ElDivider>
        <ElFormItem :label="xt('当前密码')" required
          ><ElInput
            v-model="accountPassword"
            type="password"
            show-password
            autocomplete="current-password"
            :placeholder="xt('请输入当前密码')"
        /></ElFormItem>
        <ElFormItem :label="xt('新密码')" required
          ><ElInput
            v-model="accountNewPassword"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="xt('至少 8 位')"
        /></ElFormItem>
        <ElFormItem :label="xt('确认新密码')" required
          ><ElInput
            v-model="accountConfirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="xt('再次输入新密码')"
        /></ElFormItem>
        <ElButton
          type="primary"
          :loading="accountBusy === 'password'"
          :disabled="!accountPassword || !accountNewPassword || !accountConfirmPassword"
          @click="saveAdminPassword"
          >{{ xt('保存密码') }}</ElButton
        >
      </ElForm>
    </div>
  </ElCard>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { fetchGetUserInfo } from '@/api/auth'
  import { settingsApi as xinyueApi } from '@/api/xinyue/settings'
  import { xinyueText as xt } from '@/locales/xinyue'
  import { useUserStore } from '@/store/modules/user'

  defineOptions({ name: 'AdminAccountCard' })
  const userStore = useUserStore()
  const accountEmail = ref(userStore.getUserInfo.email || '')
  const accountEmailDraft = ref(accountEmail.value)
  const accountEmailPassword = ref('')
  const accountPassword = ref('')
  const accountNewPassword = ref('')
  const accountConfirmPassword = ref('')
  const accountBusy = ref<'email' | 'password' | null>(null)

  async function refreshAdminIdentity() {
    const identity = await fetchGetUserInfo()
    userStore.setUserInfo(identity)
    accountEmail.value = identity.email || ''
    accountEmailDraft.value = accountEmail.value
  }

  async function saveAdminEmail() {
    if (!accountEmailDraft.value || !accountEmailPassword.value)
      return ElMessage.warning(xt('请输入新邮箱和当前密码'))
    accountBusy.value = 'email'
    try {
      await xinyueApi.updateAdminAccount({
        currentPassword: accountEmailPassword.value,
        email: accountEmailDraft.value
      })
      accountEmailPassword.value = ''
      await refreshAdminIdentity()
      ElMessage.success(xt('管理员邮箱已更新'))
    } finally {
      accountBusy.value = null
    }
  }

  async function saveAdminPassword() {
    if (!accountPassword.value || !accountNewPassword.value || !accountConfirmPassword.value)
      return ElMessage.warning(xt('请完整填写密码'))
    if (accountNewPassword.value.length < 8) return ElMessage.warning(xt('新密码至少需要 8 位'))
    if (accountNewPassword.value !== accountConfirmPassword.value)
      return ElMessage.warning(xt('两次输入的新密码不一致'))
    accountBusy.value = 'password'
    try {
      await xinyueApi.updateAdminAccount({
        currentPassword: accountPassword.value,
        newPassword: accountNewPassword.value
      })
      accountPassword.value = ''
      accountNewPassword.value = ''
      accountConfirmPassword.value = ''
      await refreshAdminIdentity()
      ElMessage.success(xt('管理员密码已更新'))
    } finally {
      accountBusy.value = null
    }
  }
</script>

<style scoped>
  .account-card :deep(.el-alert) {
    margin-bottom: 16px;
  }
  .account-forms {
    display: grid;
    gap: 24px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .account-forms > form {
    min-width: 0;
  }
  .card-title {
    align-items: center;
    display: flex;
    gap: 10px;
    justify-content: space-between;
  }
  @media (max-width: 900px) {
    .account-forms {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }
</style>
