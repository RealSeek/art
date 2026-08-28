<!-- 全局搜索组件 -->
<template>
  <div class="layout-search">
    <ElDialog
      v-model="showSearchDialog"
      width="600"
      :show-close="false"
      :lock-scroll="false"
      modal-class="search-modal"
      @close="closeSearchDialog"
    >
      <ElInput
        v-model.trim="searchVal"
        :placeholder="$t('search.placeholder')"
        @input="search"
        @blur="searchBlur"
        ref="searchInput"
        :prefix-icon="Search"
        class="h-12"
      >
        <template #suffix>
          <div
            class="h-4.5 flex-cc rounded border border-g-300 dark:!bg-g-200/50 !bg-box px-1.5 text-g-500"
          >
            <ArtSvgIcon icon="fluent:arrow-enter-left-20-filled" />
          </div>
        </template>
      </ElInput>
      <ElScrollbar class="mt-5" max-height="370px" ref="searchResultScrollbar" always>
        <div class="result w-full" v-show="searchResult.length">
          <button
            type="button"
            class="box search-result-row !mt-0 text-base leading-none"
            v-for="(item, index) in searchResult"
            :key="resultKey(item, index)"
            :class="isHighlighted(index) ? 'highlighted' : ''"
            @click="searchGoPage(item)"
            @mouseenter="highlightOnHover(index)"
          >
            <span class="search-result-icon" aria-hidden="true">
              <ArtSvgIcon :icon="item.meta.icon || 'ri:file-list-3-line'" />
            </span>
            <span class="search-result-copy">
              <strong>{{ formatMenuTitle(item.meta.title) }}</strong>
              <small v-if="searchResultPath(item)">{{ searchResultPath(item) }}</small>
            </span>
            <span class="search-result-enter" aria-hidden="true">
              <ArtSvgIcon v-show="isHighlighted(index)" icon="fluent:arrow-enter-left-20-filled" />
            </span>
          </button>
        </div>

        <div v-show="searchVal && searchResult.length === 0" class="search-empty">
          <ArtSvgIcon icon="ri:search-line" />
          <strong>{{ $t('search.noResult') }}</strong>
          <small>{{ $t('search.noResultHint') }}</small>
        </div>

        <div v-show="!searchVal && searchResult.length === 0 && historyResult.length > 0">
          <p class="text-xs text-g-500">{{ $t('search.historyTitle') }}</p>
          <div class="mt-1.5 w-full history-result">
            <div
              class="box search-history-row mt-2 c-p"
              v-for="(item, index) in historyResult"
              :key="resultKey(item, index)"
              :class="historyHIndex === index ? 'highlighted [&_.selected-icon]:!text-white' : ''"
              @click="searchGoPage(item)"
              @mouseenter="highlightOnHoverHistory(index)"
            >
              <span class="search-result-copy">
                <strong>{{ formatMenuTitle(item.meta.title) }}</strong>
                <small v-if="searchResultPath(item)">{{ searchResultPath(item) }}</small>
              </span>
              <div
                class="size-5 selected-icon select-none rounded-full text-g-500 flex-cc c-p"
                @click.stop="deleteHistory(index)"
              >
                <ArtSvgIcon icon="ri:close-large-fill" class="text-xs" />
              </div>
            </div>
          </div>
        </div>
      </ElScrollbar>

      <template #footer>
        <div class="dialog-footer box-border flex-c border-t-d pt-4.5 pb-1">
          <div class="flex-cc">
            <ArtSvgIcon icon="fluent:arrow-enter-left-20-filled" class="keyboard" />
            <span class="mr-3.5 text-xs text-g-700">{{ $t('search.selectKeydown') }}</span>
          </div>
          <div class="flex-c">
            <ArtSvgIcon icon="ri:arrow-up-wide-fill" class="keyboard" />
            <ArtSvgIcon icon="ri:arrow-down-wide-fill" class="keyboard" />
            <span class="mr-3.5 text-xs text-g-700">{{ $t('search.switchKeydown') }}</span>
          </div>
          <div class="flex-c">
            <i class="keyboard !w-8 flex-cc"><p class="text-[10px] font-medium">ESC</p></i>
            <span class="mr-3.5 text-xs text-g-700">{{ $t('search.exitKeydown') }}</span>
          </div>
        </div>
      </template>
    </ElDialog>
  </div>
</template>

<script lang="ts" setup>
  import { useUserStore } from '@/store/modules/user'
  import { AppRouteRecord } from '@/types/router'
  import { Search } from '@element-plus/icons-vue'
  import { mittBus } from '@/utils/sys'
  import { useMenuStore } from '@/store/modules/menu'
  import { formatMenuTitle } from '@/utils/router'
  import { handleMenuJump } from '@/utils/navigation'
  import { searchMenuItems } from '@/utils/menu-search'
  import { type ScrollbarInstance } from 'element-plus'

  defineOptions({ name: 'ArtGlobalSearch' })

  const userStore = useUserStore()
  const { menuList } = storeToRefs(useMenuStore())

  const showSearchDialog = ref(false)
  const searchVal = ref('')
  const searchResult = ref<AppRouteRecord[]>([])
  const historyMaxLength = 10

  const { searchHistory: historyResult } = storeToRefs(userStore)

  const searchInput = ref<HTMLInputElement | null>(null)
  const highlightedIndex = ref(0)
  const historyHIndex = ref(0)
  const searchResultScrollbar = ref<ScrollbarInstance>()
  const isKeyboardNavigating = ref(false) // 新增状态：是否正在使用键盘导航

  // 生命周期钩子
  onMounted(() => {
    mittBus.on('openSearchDialog', openSearchDialog)
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    mittBus.off('openSearchDialog', openSearchDialog)
    document.removeEventListener('keydown', handleKeydown)
  })

  // 键盘快捷键处理
  const handleKeydown = (event: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const isCommandKey = isMac ? event.metaKey : event.ctrlKey

    if (isCommandKey && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      showSearchDialog.value = true
      focusInput()
    }

    // 当搜索对话框打开时，处理方向键和回车键
    if (showSearchDialog.value) {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        highlightPrevious()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        highlightNext()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        selectHighlighted()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        showSearchDialog.value = false
      }
    }
  }

  const focusInput = () => {
    setTimeout(() => {
      searchInput.value?.focus()
    }, 100)
  }

  // 搜索逻辑
  const search = (val: string) => {
    highlightedIndex.value = 0
    searchResult.value = searchMenuItems(menuList.value, val, formatMenuTitle)
  }

  // 高亮控制并实现滚动条跟随
  const highlightPrevious = () => {
    isKeyboardNavigating.value = true
    if (searchVal.value) {
      if (!searchResult.value.length) return resetKeyboardNavigation()
      highlightedIndex.value =
        (highlightedIndex.value - 1 + searchResult.value.length) % searchResult.value.length
      scrollToHighlightedItem()
    } else {
      if (!historyResult.value.length) return resetKeyboardNavigation()
      historyHIndex.value =
        (historyHIndex.value - 1 + historyResult.value.length) % historyResult.value.length
      scrollToHighlightedHistoryItem()
    }
    resetKeyboardNavigation()
  }

  const highlightNext = () => {
    isKeyboardNavigating.value = true
    if (searchVal.value) {
      if (!searchResult.value.length) return resetKeyboardNavigation()
      highlightedIndex.value = (highlightedIndex.value + 1) % searchResult.value.length
      scrollToHighlightedItem()
    } else {
      if (!historyResult.value.length) return resetKeyboardNavigation()
      historyHIndex.value = (historyHIndex.value + 1) % historyResult.value.length
      scrollToHighlightedHistoryItem()
    }
    resetKeyboardNavigation()
  }

  const resetKeyboardNavigation = () => {
    setTimeout(() => {
      isKeyboardNavigating.value = false
    }, 100)
  }

  const scrollToHighlightedItem = () => {
    nextTick(() => {
      if (!searchResultScrollbar.value || !searchResult.value.length) return

      const scrollWrapper = searchResultScrollbar.value.wrapRef
      if (!scrollWrapper) return

      const highlightedElements = scrollWrapper.querySelectorAll('.result .box')
      if (!highlightedElements[highlightedIndex.value]) return

      const highlightedElement = highlightedElements[highlightedIndex.value] as HTMLElement
      const itemHeight = highlightedElement.offsetHeight
      const scrollTop = scrollWrapper.scrollTop
      const containerHeight = scrollWrapper.clientHeight
      const itemTop = highlightedElement.offsetTop
      const itemBottom = itemTop + itemHeight

      if (itemTop < scrollTop) {
        searchResultScrollbar.value.setScrollTop(itemTop)
      } else if (itemBottom > scrollTop + containerHeight) {
        searchResultScrollbar.value.setScrollTop(itemBottom - containerHeight)
      }
    })
  }

  const scrollToHighlightedHistoryItem = () => {
    nextTick(() => {
      if (!searchResultScrollbar.value || !historyResult.value.length) return

      const scrollWrapper = searchResultScrollbar.value.wrapRef
      if (!scrollWrapper) return

      const historyItems = scrollWrapper.querySelectorAll('.history-result .box')
      if (!historyItems[historyHIndex.value]) return

      const highlightedElement = historyItems[historyHIndex.value] as HTMLElement
      const itemHeight = highlightedElement.offsetHeight
      const scrollTop = scrollWrapper.scrollTop
      const containerHeight = scrollWrapper.clientHeight
      const itemTop = highlightedElement.offsetTop
      const itemBottom = itemTop + itemHeight

      if (itemTop < scrollTop) {
        searchResultScrollbar.value.setScrollTop(itemTop)
      } else if (itemBottom > scrollTop + containerHeight) {
        searchResultScrollbar.value.setScrollTop(itemBottom - containerHeight)
      }
    })
  }

  const selectHighlighted = () => {
    if (searchVal.value && searchResult.value.length) {
      searchGoPage(searchResult.value[highlightedIndex.value])
    } else if (!searchVal.value && historyResult.value.length) {
      searchGoPage(historyResult.value[historyHIndex.value])
    }
  }

  const isHighlighted = (index: number) => {
    return highlightedIndex.value === index
  }

  const resultKey = (item: AppRouteRecord, index: number) =>
    String(item.path || item.meta.link || item.name || index)

  const searchResultPath = (item: AppRouteRecord) => (item.meta.searchBreadcrumb || []).join(' / ')

  const searchBlur = () => {
    highlightedIndex.value = 0
  }

  const searchGoPage = (item: AppRouteRecord) => {
    showSearchDialog.value = false
    addHistory(item)
    handleMenuJump(item)
    searchVal.value = ''
    searchResult.value = []
  }

  // 历史记录管理
  const updateHistory = () => {
    if (Array.isArray(historyResult.value)) {
      userStore.setSearchHistory(historyResult.value)
    }
  }

  const addHistory = (item: AppRouteRecord) => {
    const itemKey = item.path || String(item.meta.link || '')
    const hasItemIndex = historyResult.value.findIndex(
      (historyItem: AppRouteRecord) =>
        (historyItem.path || String(historyItem.meta.link || '')) === itemKey
    )

    if (hasItemIndex !== -1) {
      historyResult.value.splice(hasItemIndex, 1)
    } else if (historyResult.value.length >= historyMaxLength) {
      historyResult.value.pop()
    }

    const cleanedItem = { ...item }
    delete cleanedItem.children
    delete cleanedItem.meta.authList
    historyResult.value.unshift(cleanedItem)
    updateHistory()
  }

  const deleteHistory = (index: number) => {
    historyResult.value.splice(index, 1)
    updateHistory()
  }

  // 对话框控制
  const openSearchDialog = () => {
    showSearchDialog.value = true
    focusInput()
  }

  const closeSearchDialog = () => {
    searchVal.value = ''
    searchResult.value = []
    highlightedIndex.value = 0
    historyHIndex.value = 0
  }

  // 修改 hover 高亮逻辑，只有在非键盘导航时才生效
  const highlightOnHover = (index: number) => {
    if (!isKeyboardNavigating.value && searchVal.value) {
      highlightedIndex.value = index
    }
  }

  const highlightOnHoverHistory = (index: number) => {
    if (!isKeyboardNavigating.value && !searchVal.value) {
      historyHIndex.value = index
    }
  }
</script>
<style lang="scss" scoped>
  .layout-search {
    :deep(.el-dialog) {
      max-width: calc(100vw - 24px);
    }

    :deep(.search-modal) {
      background-color: rgb(0 0 0 / 20%);
    }

    :deep(.el-dialog__body) {
      padding: 5px 0 0 !important;
    }

    :deep(.el-dialog__header) {
      padding: 0;
    }

    .el-input {
      :deep(.el-input__wrapper) {
        background-color: var(--art-gray-200);
        border: 1px solid var(--default-border-dashed);
        border-radius: calc(var(--custom-radius) / 2 + 2px) !important;
        box-shadow: none;
      }

      :deep(.el-input__inner) {
        color: var(--art-gray-800) !important;
      }
    }

    .search-result-row,
    .search-history-row {
      align-items: center;
      background: var(--art-gray-200);
      border: 1px solid transparent;
      border-radius: calc(var(--custom-radius) / 2 + 2px);
      color: var(--art-gray-800);
      display: grid;
      gap: 10px;
      grid-template-columns: 32px minmax(0, 1fr) 24px;
      margin-top: 8px;
      min-height: 58px;
      padding: 7px 12px;
      text-align: left;
      transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
      width: 100%;
    }

    .search-result-row:first-child {
      margin-top: 0;
    }

    .search-history-row {
      grid-template-columns: minmax(0, 1fr) 24px;
    }

    .search-result-row:hover,
    .search-history-row:hover {
      border-color: color-mix(in srgb, var(--main-color) 24%, transparent);
    }

    .search-result-row.highlighted,
    .search-history-row.highlighted {
      background: color-mix(in srgb, var(--main-color) 78%, var(--art-gray-100));
      color: white;
    }

    .search-result-icon {
      align-items: center;
      background: color-mix(in srgb, var(--main-color) 10%, var(--art-gray-100));
      border-radius: 7px;
      color: var(--main-color);
      display: flex;
      font-size: 16px;
      height: 32px;
      justify-content: center;
      width: 32px;
    }

    .highlighted .search-result-icon {
      background: rgb(255 255 255 / 16%);
      color: white;
    }

    .search-result-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .search-result-copy strong {
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-result-copy small {
      color: var(--art-gray-500);
      font-size: 10px;
      line-height: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .highlighted .search-result-copy small {
      color: rgb(255 255 255 / 72%);
    }

    .search-result-enter {
      align-items: center;
      display: flex;
      height: 24px;
      justify-content: center;
      width: 24px;
    }

    .search-empty {
      align-items: center;
      color: var(--art-gray-500);
      display: flex;
      flex-direction: column;
      gap: 6px;
      justify-content: center;
      min-height: 180px;
      padding: 24px;
      text-align: center;
    }

    .search-empty > svg {
      font-size: 24px;
      margin-bottom: 4px;
    }

    .search-empty strong {
      color: var(--art-gray-700);
      font-size: 13px;
    }

    .search-empty small {
      font-size: 11px;
    }
  }

  .dark .layout-search {
    .el-input {
      :deep(.el-input__wrapper) {
        background-color: #333;
        border: 1px solid #4c4d50;
      }
    }

    :deep(.search-modal) {
      background-color: rgb(23 23 26 / 60%);
      backdrop-filter: none;
    }

    :deep(.el-dialog) {
      background-color: #252526;
    }
  }
</style>

<style scoped>
  @reference '@styles/core/tailwind.css';

  .keyboard {
    @apply mr-2 
    box-border
    h-5 
    w-5.5
    rounded
    border 
    border-g-400 
    px-1 
    text-g-500
    shadow-[0_2px_0_var(--default-border-dashed)] 
    last-of-type:mr-1.5;
  }
</style>
