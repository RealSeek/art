<template>
  <div
    class="sidebar-brand"
    :class="{ 'is-collapsed': collapsed, 'is-dual': dual }"
    :style="{ background: background }"
    role="button"
    tabindex="0"
    :aria-label="systemName"
    @click="$emit('navigate')"
    @keydown.enter="$emit('navigate')"
    @keydown.space.prevent="$emit('navigate')"
  >
    <ArtLogo class="sidebar-brand__logo" />
    <span
      v-if="!dual || showDualText"
      class="sidebar-brand__name"
      :style="{ color: systemNameColor }"
      :aria-hidden="collapsed"
    >
      {{ systemName }}
    </span>
  </div>
</template>

<script setup lang="ts">
  interface Props {
    systemName: string
    background: string
    systemNameColor: string
    collapsed?: boolean
    dual?: boolean
    showDualText?: boolean
  }

  withDefaults(defineProps<Props>(), {
    collapsed: false,
    dual: false,
    showDualText: false
  })

  defineEmits<{ navigate: [] }>()
</script>

<style scoped>
  .sidebar-brand {
    position: relative;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    height: 64px;
    padding: 0 20px;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    transition: padding 0.2s ease;
  }

  .sidebar-brand:focus-visible {
    outline: 2px solid var(--theme-color);
    outline-offset: -2px;
  }

  .sidebar-brand__logo {
    flex: 0 0 auto;
  }

  .sidebar-brand__name {
    min-width: 0;
    margin-left: 10px;
    overflow: hidden;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-brand.is-collapsed {
    justify-content: center;
    padding: 0;
  }

  .sidebar-brand.is-collapsed .sidebar-brand__name {
    width: 0;
    margin: 0;
    opacity: 0;
  }

  .sidebar-brand.is-dual {
    height: 68px;
    justify-content: center;
    padding: 0 8px;
  }

  .sidebar-brand.is-dual .sidebar-brand__name {
    margin-top: 4px;
    margin-left: 0;
    font-size: 11px;
  }

  @media (width <= 800px) {
    .sidebar-brand {
      height: 56px;
      padding-inline: 16px;
    }
  }
</style>
