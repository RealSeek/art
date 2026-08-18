<template>
  <section class="canvas-drama-shot-settings">
    <div class="canvas-inspector-section-heading">
      <div><strong>镜头信息</strong><span>分镜图与成片共享镜头事实</span></div>
      <Clapperboard :size="17" />
    </div>
    <div class="canvas-inspector-grid">
      <label>场景<input :value="data.sceneName || ''" placeholder="例如：天台·夜" @focus="emit('checkpoint')" @input="updateText('sceneName', $event)" /></label>
      <label>时长<input type="number" min="1" max="60" :value="data.duration || 5" @focus="emit('checkpoint')" @input="updateDuration" /></label>
    </div>
    <label>角色<input :value="data.characterNames?.join('、') || ''" placeholder="使用顿号或逗号分隔" @focus="emit('checkpoint')" @input="updateCharacters" /></label>
    <label>运镜<input :value="data.cameraMotion || ''" placeholder="例如：缓慢推近" @focus="emit('checkpoint')" @input="updateText('cameraMotion', $event)" /></label>
    <label>对白<textarea :value="data.dialogue || ''" rows="3" @focus="emit('checkpoint')" @input="updateText('dialogue', $event)" /></label>
    <label>旁白<textarea :value="data.narration || ''" rows="3" @focus="emit('checkpoint')" @input="updateText('narration', $event)" /></label>

    <button class="canvas-continuity-toggle" type="button" :aria-expanded="continuityOpen" @click="continuityOpen = !continuityOpen">
      <span><SlidersHorizontal :size="16" /><span><strong>连续性控制</strong><small>景别、站位、视线和动作衔接</small></span></span>
      <ChevronDown :size="16" :class="{ 'is-open': continuityOpen }" />
    </button>
    <div v-if="continuityOpen" class="canvas-continuity-fields">
      <div class="canvas-inspector-grid">
        <label>景别<input :value="continuity.shotSize || ''" placeholder="近景 / 中景 / 全景" @focus="emit('checkpoint')" @input="updateContinuity('shotSize', $event)" /></label>
        <label>机位角度<input :value="continuity.cameraAngle || ''" placeholder="平视 / 俯拍 / 侧后方" @focus="emit('checkpoint')" @input="updateContinuity('cameraAngle', $event)" /></label>
      </div>
      <label>构图<input :value="continuity.composition || ''" placeholder="主体位置与画面留白" @focus="emit('checkpoint')" @input="updateContinuity('composition', $event)" /></label>
      <label>人物站位<input :value="continuity.characterBlocking || ''" placeholder="人物在画面中的相对位置" @focus="emit('checkpoint')" @input="updateContinuity('characterBlocking', $event)" /></label>
      <label>视线方向<input :value="continuity.gazeDirection || ''" placeholder="看向画面左侧，保持向右运动" @focus="emit('checkpoint')" @input="updateContinuity('gazeDirection', $event)" /></label>
      <label>轴线规则<input :value="continuity.axisRule || ''" placeholder="保持同侧，不越轴" @focus="emit('checkpoint')" @input="updateContinuity('axisRule', $event)" /></label>
      <label>动作起始<textarea :value="continuity.actionStart || ''" rows="2" placeholder="镜头开始时人物的状态" @focus="emit('checkpoint')" @input="updateContinuity('actionStart', $event)" /></label>
      <label>动作结束<textarea :value="continuity.actionEnd || ''" rows="2" placeholder="为下一镜头保留的动作状态" @focus="emit('checkpoint')" @input="updateContinuity('actionEnd', $event)" /></label>
      <label>衔接备注<textarea :value="continuity.notes || ''" rows="2" placeholder="与相邻镜头必须保持的细节" @focus="emit('checkpoint')" @input="updateContinuity('notes', $event)" /></label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Clapperboard, SlidersHorizontal } from 'lucide-vue-next'
import type { CanvasNodeData, CanvasShotContinuity } from '../types/canvas'

const props = defineProps<{ data: CanvasNodeData }>()
const emit = defineEmits<{ update: [patch: Partial<CanvasNodeData>]; checkpoint: [] }>()
const continuityOpen = ref(Boolean(props.data.continuity && Object.values(props.data.continuity).some(Boolean)))
const continuity = computed(() => props.data.continuity || {})

function eventValue(event: Event) { return (event.target as HTMLInputElement | HTMLTextAreaElement).value }
function updateText(field: 'sceneName' | 'cameraMotion' | 'dialogue' | 'narration', event: Event) { emit('update', { [field]: eventValue(event) }) }
function updateDuration(event: Event) { emit('update', { duration: Math.max(1, Math.min(60, Number(eventValue(event)) || 5)) }) }
function updateCharacters(event: Event) { emit('update', { characterNames: eventValue(event).split(/[、,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 12) }) }
function updateContinuity(field: keyof CanvasShotContinuity, event: Event) { emit('update', { continuity: { ...continuity.value, [field]: eventValue(event) } }) }
</script>
