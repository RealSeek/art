<template>
  <RouterLink :to="to" class="brand-mark" :class="{ 'brand-mark--dark': dark, 'brand-mark--compact': compact }">
    <span class="brand-mark__icon">O</span>
    <span v-if="!compact" class="brand-mark__name">OnlyArt</span>
  </RouterLink>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    to?: string
    dark?: boolean
    compact?: boolean
  }>(),
  {
    to: '/',
    dark: false,
    compact: false,
  }
)
</script>
