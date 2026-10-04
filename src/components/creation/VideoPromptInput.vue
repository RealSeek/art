<template>
  <div class="video-prompt">
    <div ref="editor" class="video-prompt__editor" role="textbox" aria-label="创作描述" aria-multiline="true" contenteditable="true" spellcheck="false" :data-placeholder="placeholder" :data-empty="!draft" :aria-expanded="menuOpen" :aria-controls="menuOpen ? menuId : undefined" :aria-activedescendant="menuOpen && filteredReferences[activeIndex] ? `${menuId}-${activeIndex}` : undefined" @input="onInput" @keydown="onKeydown" @keyup="rememberSelection" @pointerup="rememberSelection" @focus="emit('focus')" @blur="onBlur" @compositionstart="composing = true" @compositionend="onCompositionEnd" @paste="onPaste" @copy="onCopy" @cut="onCut" @mouseover="onChipHover" @mouseout="clearPreview" />
    <div v-if="usedReferences.length" class="video-prompt__references" aria-label="提示词引用内容">
      <button v-for="item in usedReferences" :key="item.token" type="button" :aria-label="`预览 ${item.title}`" @mouseenter="showPreview(item, $event.currentTarget as HTMLElement)" @mouseleave="clearPreview" @focus="showPreview(item, $event.currentTarget as HTMLElement)" @blur="clearPreview">
        <img v-if="item.kind === 'image'" :src="item.thumbnail" alt="" />
        <Film v-else-if="item.kind === 'video'" :size="15" />
        <Music v-else :size="15" />
        <span>{{ item.title }}</span>
      </button>
      <span>提示词内容</span>
    </div>
    <Teleport to="body">
      <div v-if="menuOpen" :id="menuId" ref="menu" class="video-reference-menu" :style="menuStyle" role="listbox" aria-label="可引用的内容" @mousedown.prevent>
        <header>可引用的内容</header>
        <button v-for="(item, index) in filteredReferences" :id="`${menuId}-${index}`" :key="item.token" type="button" role="option" :aria-selected="index === activeIndex" :class="{ 'is-active': index === activeIndex }" :aria-label="`引用 ${item.title}`" @mouseenter="activeIndex = index" @click="insertReference(item)">
          <img v-if="item.kind === 'image'" :src="item.thumbnail" alt="" />
          <video v-else-if="item.kind === 'video'" :src="item.thumbnail" muted preload="metadata" />
          <span v-else class="video-reference-menu__audio"><Music :size="20" /></span>
          <span><strong>{{ item.title }}</strong><small>{{ item.label }}</small></span>
        </button>
        <p v-if="!filteredReferences.length">{{ references.length ? '没有匹配的参考内容' : '暂无参考内容' }}</p>
        <button class="video-reference-menu__upload" type="button" :disabled="!canAddImages" @click="menuOpen = false; emit('upload')"><Plus :size="18" />上传参考素材</button>
      </div>
      <div v-if="preview" class="video-reference-preview" :style="previewStyle" role="tooltip" @mouseenter="keepPreview" @mouseleave="clearPreview">
        <img v-if="preview.kind === 'image'" :src="preview.thumbnail" :alt="preview.title" />
        <video v-else-if="preview.kind === 'video'" :src="preview.thumbnail" muted autoplay loop playsinline />
        <audio v-else :src="preview.thumbnail" controls />
        <span>{{ preview.title }}</span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { Film, Music, Plus } from 'lucide-vue-next'
import type { ReferenceMention } from './creation-shared'

const props = defineProps<{ references: ReferenceMention[]; canAddImages: boolean }>()
const modelValue = defineModel<string>({ required: true })
const draft = ref(modelValue.value)
const emit = defineEmits<{ focus: []; upload: [] }>()
const editor = ref<HTMLDivElement | null>(null)
const menu = ref<HTMLDivElement | null>(null)
const menuId = useId()
const menuOpen = ref(false)
const menuStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const query = ref('')
const activeIndex = ref(0)
const preview = ref<ReferenceMention | null>(null)
const previewStyle = ref<Record<string, string>>({})
const composing = ref(false)
let selection = { start: 0, end: 0 }
let mentionStart = 0
let toolbarAnchor: HTMLElement | null = null
let previewTimer: ReturnType<typeof setTimeout> | undefined
const history: Array<{ text: string; caret: number }> = [{ text: draft.value, caret: 0 }]
let historyIndex = 0

const placeholder = computed(() => props.references.length
  ? '使用 @ 快速调用参考内容，例如：@参考图0 模仿 @参考视频0 的动作，音色参考 @参考音频0'
  : '上传参考素材，输入文字或参考内容，自由组合图片、文字、音频与视频元素，定义精彩互动。')
const filteredReferences = computed(() => props.references.filter((item) => `${item.title} ${item.label}`.toLowerCase().includes(query.value.toLowerCase())))
const usedReferences = computed(() => {
  const tokens = new Set(draft.value.match(/@参考(?:图|视频|音频)\d+/g) || [])
  return props.references.filter((item) => tokens.has(item.token))
})

// Reference chips display filenames but serialize to the existing generation tokens.
function textOf(node: Node): string {
  if (node instanceof HTMLElement && node.dataset.reference) return node.dataset.reference
  if (node.nodeName === 'BR') return '\n'
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  return Array.from(node.childNodes).map((child, index) => `${index && /^(DIV|P)$/.test(child.nodeName) ? '\n' : ''}${textOf(child)}`).join('')
}

function rememberSelection() {
  const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null
  const root = editor.value
  if (!root || !range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return
  const before = range.cloneRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  const start = textOf(before.cloneContents()).length
  selection = { start, end: start + textOf(range.cloneContents()).length }
}

function setCaret(position: number) {
  const root = editor.value!
  const range = document.createRange()
  let remaining = position
  for (const node of root.childNodes) {
    const length = textOf(node).length
    if (node.nodeType === Node.TEXT_NODE && remaining <= length) { range.setStart(node, remaining); remaining = -1; break }
    if (remaining < length) { range.setStartBefore(node); remaining = -1; break }
    remaining -= length
    if (!remaining) { range.setStartAfter(node); remaining = -1; break }
  }
  if (remaining >= 0) { range.selectNodeContents(root); range.collapse(false) }
  range.collapse(true)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  selection = { start: position, end: position }
}

function render(caret?: number) {
  const root = editor.value
  if (!root) return
  const fragment = document.createDocumentFragment()
  let offset = 0
  for (const match of draft.value.matchAll(/@参考(?:图|视频|音频)\d+/g)) {
    fragment.append(document.createTextNode(draft.value.slice(offset, match.index)))
    const item = props.references.find((reference) => reference.token === match[0])
    if (item) {
      const chip = document.createElement('span')
      chip.className = 'video-prompt__chip'
      chip.contentEditable = 'false'
      chip.dataset.reference = item.token
      chip.title = `${item.label} · ${item.title}`
      if (item.kind === 'image') {
        const image = document.createElement('img')
        image.src = item.thumbnail
        image.alt = ''
        chip.append(image)
      }
      const label = document.createElement('span')
      label.textContent = item.title
      chip.append(label)
      fragment.append(chip)
    } else fragment.append(document.createTextNode(match[0]))
    offset = match.index! + match[0].length
  }
  fragment.append(document.createTextNode(draft.value.slice(offset)))
  root.replaceChildren(fragment)
  if (caret !== undefined) setCaret(Math.min(caret, draft.value.length))
}

function update(text: string, caret: number, record = true) {
  draft.value = text
  modelValue.value = text
  if (record) {
    history.splice(historyIndex + 1)
    history.push({ text, caret })
    historyIndex = history.length - 1
  }
  render(caret)
}

function replaceSelection(text: string) {
  update(draft.value.slice(0, selection.start) + text + draft.value.slice(selection.end), selection.start + text.length)
}

function onInput() {
  if (composing.value) return
  rememberSelection()
  update(textOf(editor.value!), selection.end)
  syncMenu()
}

function onCompositionEnd() { composing.value = false; onInput() }
function onBlur() { rememberSelection(); menuOpen.value = false }
function syncMenu() {
  toolbarAnchor = null
  const match = /@([^\s@]{0,40})$/.exec(draft.value.slice(0, selection.start))
  menuOpen.value = Boolean(match)
  if (!match) return
  query.value = match[1]
  activeIndex.value = 0
  mentionStart = selection.start - match[0].length
  void nextTick(positionMenu)
}

function positionMenu() {
  if (!menuOpen.value || !menu.value || !editor.value) return
  const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null
  const caretRect = range?.getBoundingClientRect()
  const rect = toolbarAnchor?.getBoundingClientRect() || (caretRect?.width || caretRect?.height ? caretRect : editor.value.getBoundingClientRect())
  const width = Math.min(240, window.innerWidth - 24)
  const height = Math.min(menu.value.scrollHeight, 320)
  const top = rect.bottom + height + 8 <= window.innerHeight - 12 ? rect.bottom + 8 : Math.max(12, rect.top - height - 8)
  menuStyle.value = { left: `${Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))}px`, top: `${top}px`, width: `${width}px` }
}

function openMentions(anchor: HTMLElement) {
  rememberSelection()
  toolbarAnchor = anchor
  mentionStart = selection.start
  query.value = ''
  activeIndex.value = 0
  menuOpen.value = !menuOpen.value
  void nextTick(positionMenu)
}

function insertReference(item: ReferenceMention) {
  const start = menuOpen.value ? mentionStart : selection.start
  const end = menuOpen.value && !toolbarAnchor ? selection.start : selection.end
  editor.value!.focus()
  update(draft.value.slice(0, start) + item.token + ' ' + draft.value.slice(end), start + item.token.length + 1)
  menuOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (['Backspace', 'Delete'].includes(event.key)) {
    rememberSelection()
    if (selection.start === selection.end) {
      for (const match of draft.value.matchAll(/@参考(?:图|视频|音频)\d+/g)) {
        if (!props.references.some((item) => item.token === match[0])) continue
        const start = match.index!
        const end = start + match[0].length
        const removesChip = event.key === 'Backspace' ? selection.start > start && selection.start <= end : selection.start >= start && selection.start < end
        if (removesChip) {
          event.preventDefault()
          update(draft.value.slice(0, start) + draft.value.slice(end), start)
          menuOpen.value = false
          return
        }
      }
    }
  }
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault()
    const direction = event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1
    historyIndex = Math.max(0, Math.min(history.length - 1, historyIndex + direction))
    update(history[historyIndex].text, history[historyIndex].caret, false)
    menuOpen.value = false
    return
  }
  if (event.key === 'Escape') { menuOpen.value = false; clearPreview(); return }
  if (menuOpen.value && filteredReferences.value.length && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key)) {
    event.preventDefault()
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + filteredReferences.value.length) % filteredReferences.value.length
      menu.value?.querySelectorAll('[role=option]')[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
    } else insertReference(filteredReferences.value[activeIndex.value])
    return
  }
  if (event.key === 'Enter') { event.preventDefault(); rememberSelection(); replaceSelection('\n'); menuOpen.value = false }
}

function onPaste(event: ClipboardEvent) {
  if (event.clipboardData?.files.length) return
  event.preventDefault()
  rememberSelection()
  replaceSelection(event.clipboardData?.getData('text/plain') || '')
  syncMenu()
}
function onCopy(event: ClipboardEvent) {
  rememberSelection()
  event.preventDefault()
  event.clipboardData?.setData('text/plain', draft.value.slice(selection.start, selection.end))
}
function onCut(event: ClipboardEvent) { onCopy(event); replaceSelection('') }

function showPreview(item: ReferenceMention, target: HTMLElement) {
  keepPreview()
  const rect = target.getBoundingClientRect()
  const width = Math.min(200, window.innerWidth - 24)
  preview.value = item
  previewStyle.value = { left: `${Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))}px`, top: `${rect.top >= 172 ? rect.top - 164 : rect.bottom + 8}px`, width: `${width}px` }
}
function keepPreview() { clearTimeout(previewTimer) }
function clearPreview() { keepPreview(); previewTimer = setTimeout(() => { preview.value = null }, 120) }
function onChipHover(event: MouseEvent) {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-reference]')
  const item = props.references.find((reference) => reference.token === target?.dataset.reference)
  if (target && item) showPreview(item, target)
}
function onOutsidePointer(event: PointerEvent) {
  const target = event.target as Node
  if (!menu.value?.contains(target) && !editor.value?.contains(target) && !toolbarAnchor?.contains(target)) menuOpen.value = false
}
function closePopovers(event?: Event) {
  if (event?.type === 'scroll' && menu.value?.contains(event.target as Node)) return
  menuOpen.value = false
  keepPreview()
  preview.value = null
}

watch(modelValue, () => {
  if (!composing.value && editor.value && draft.value !== modelValue.value) {
    draft.value = modelValue.value
    history.splice(0, history.length, { text: modelValue.value, caret: modelValue.value.length })
    historyIndex = 0
    render(document.activeElement === editor.value ? selection.start : undefined)
  }
})
watch(() => props.references, () => { render(document.activeElement === editor.value ? selection.start : undefined); closePopovers() }, { deep: true })
onMounted(() => {
  render()
  document.addEventListener('pointerdown', onOutsidePointer)
  document.addEventListener('xinyue:close-popovers', closePopovers)
  window.addEventListener('resize', positionMenu)
  window.addEventListener('scroll', closePopovers, true)
})
onBeforeUnmount(() => {
  keepPreview()
  document.removeEventListener('pointerdown', onOutsidePointer)
  document.removeEventListener('xinyue:close-popovers', closePopovers)
  window.removeEventListener('resize', positionMenu)
  window.removeEventListener('scroll', closePopovers, true)
})

defineExpose({ element: () => editor.value, openMentions, insertReference })
</script>
