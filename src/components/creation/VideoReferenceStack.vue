<template>
  <div ref="stack" class="video-reference-stack" :class="{ 'has-materials': references.length, 'is-expanded': expanded && references.length }" :style="{ '--expanded-width': `${Math.min(references.length + 1, 5) * 64 + 12}px` }" @pointerenter="onPointerEnter" @pointerleave="onPointerLeave" @focusin="expanded = true" @focusout="onFocusOut" @keydown.esc="expanded = false">
    <button v-if="!references.length" type="button" class="video-reference-empty" :disabled="uploading || !canAddImages" aria-label="添加参考素材" title="添加参考素材" @click="emit('add', 'image')">
      <span class="creation-reference-entry__sheet"><Plus :size="19" /></span>
      <span>参考素材</span>
    </button>
    <template v-else>
      <button type="button" class="video-reference-deck" aria-label="展开参考素材" :aria-expanded="expanded" @pointerdown="onDeckPointerDown" @click="expanded = true">
        <span v-for="(item, index) in references.slice(0, 3)" :key="item.token" class="video-reference-deck__item" :style="{ '--deck-index': index }">
          <img v-if="item.kind === 'image'" :src="item.thumbnail" :alt="item.title" />
          <video v-else-if="item.kind === 'video'" :src="item.thumbnail" muted preload="metadata" />
          <Music v-else :size="25" />
        </span>
      </button>
      <button type="button" class="video-reference-add" :disabled="uploading || !canAddImages" aria-label="添加参考素材" title="添加参考素材" @click="emit('add', 'image')"><Plus :size="15" /></button>
      <div v-show="expanded" class="video-reference-expanded" aria-label="已上传参考素材">
        <div class="video-reference-expanded__items">
          <article v-for="item in references" :key="item.token" class="video-reference-tile">
            <button type="button" class="video-reference-tile__preview" :aria-label="`引用 ${item.title}`" :title="`${item.label} · ${item.title}`" @click="emit('quote', item)">
              <img v-if="item.kind === 'image'" :src="item.thumbnail" :alt="item.title" />
              <video v-else-if="item.kind === 'video'" :src="item.thumbnail" muted preload="metadata" />
              <Music v-else :size="26" />
              <span>{{ item.label }}</span>
            </button>
            <button type="button" class="video-reference-tile__remove" :aria-label="`移除${item.label} ${item.title}`" :title="`移除 ${item.title}`" @click="emit('remove', item)"><X :size="12" /></button>
          </article>
          <button v-if="canAddImages" type="button" class="video-reference-tile video-reference-tile--add" :disabled="uploading" aria-label="添加参考图片" title="添加参考图片" @click="emit('add', 'image')"><Plus :size="22" /><span>参考素材</span></button>
        </div>
        <span class="video-reference-expanded__hint">使用 <AtSign :size="12" /> 引用参考内容</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AtSign, Music, Plus, X } from 'lucide-vue-next'
import type { ReferenceMention } from './creation-shared'

defineProps<{ references: ReferenceMention[]; canAddImages: boolean; uploading: boolean }>()
const emit = defineEmits<{ add: [kind: 'image']; quote: [item: ReferenceMention]; remove: [item: ReferenceMention] }>()
const stack = ref<HTMLDivElement | null>(null)
const expanded = ref(false)

function onPointerEnter(event: PointerEvent) { if (event.pointerType === 'mouse') expanded.value = true }
function onPointerLeave(event: PointerEvent) { if (event.pointerType === 'mouse') expanded.value = false }
function onDeckPointerDown(event: PointerEvent) {
  if (event.pointerType === 'touch') { event.preventDefault(); expanded.value = true }
}

function onFocusOut(event: FocusEvent) {
  if (!stack.value?.contains(event.relatedTarget as Node | null)) expanded.value = false
}

function onOutsidePointer(event: PointerEvent) {
  if (!stack.value?.contains(event.target as Node)) expanded.value = false
}
onMounted(() => document.addEventListener('pointerdown', onOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer))
</script>
