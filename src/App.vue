<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <RouterView />
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider, type GlobalThemeOverrides } from 'naive-ui'
import { readStoredSettings } from './utils/settings-storage'

const appearance = readStoredSettings().appearance
document.documentElement.dataset.studioTheme = appearance === '浅色' || appearance === 'light'
  ? 'light'
  : appearance === '跟随系统' || appearance === 'system'
    ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    : 'dark'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#111111',
    primaryColorHover: '#2d2d2d',
    primaryColorPressed: '#000000',
    borderRadius: '8px',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
}
</script>
