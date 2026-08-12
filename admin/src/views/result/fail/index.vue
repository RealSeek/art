<template>
  <ArtResultPage
    type="fail"
    :title="xt('提交失败')"
    :message="xt('请核对并修改以下信息后，再重新提交。')"
    iconCode="ri:close-fill"
  >
    <template #content>
      <p>{{ xt('您提交的内容有如下错误：') }}</p>
      <p>
        <ArtSvgIcon icon="ri:close-circle-line" class="text-red-500 mr-1" />
        <span>{{ xt('您的账户已被冻结') }}</span>
      </p>
      <p>
        <ArtSvgIcon icon="ri:close-circle-line" class="text-red-500 mr-1" />
        <span>{{ xt('您的账户还不具备申请资格') }}</span>
      </p>
    </template>
    <template #buttons>
      <ElButton type="primary" v-ripple @click="goBack">{{ xt('返回修改') }}</ElButton>
      <ElButton v-ripple @click="goHome">{{ xt('返回工作台') }}</ElButton>
    </template>
  </ArtResultPage>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { xinyueText as xt } from '@/locales/xinyue'

  defineOptions({ name: 'ResultFail' })

  const router = useRouter()
  const goBack = () => router.back()
  const goHome = () => router.push('/dashboard/console')
</script>
