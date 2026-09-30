<template>
    <section class="studio-create-page">
      <div class="create-page-inner">
        <div class="creation-heading">
          <h1>{{ activeMode === 'commerce' ? t('studio.commerce') : t('workspace.creation') }}</h1>
          <p>{{ activeMode === 'commerce' ? '从商品参考图到成套营销素材' : '让创作随灵感而生' }}</p>
        </div>
        <div v-if="store.lastError" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ store.lastError }}</span><button type="button" aria-label="关闭提示" @click="store.clearError"><X :size="15" /></button></div>
        <div v-if="modelCatalogError && !activeCreationModels.length" class="studio-feedback studio-feedback--inline" role="alert"><span>{{ modelCatalogError }}</span><button type="button" aria-label="重新加载模型目录" title="重新加载模型目录" @click="refreshModelCatalog"><RefreshCw :size="15" /></button></div>
        <form ref="creationComposer" class="creation-composer" :class="{ 'is-commerce': activeMode === 'commerce', 'is-video': activeMode === 'videos' }" @submit.prevent="submitGeneration">
          <div class="creation-prompt-row">
            <textarea ref="generationInput" v-model="generationPrompt" rows="2" aria-label="创作描述" :placeholder="creationPromptPlaceholder" @focus="collapseWorkspacePopovers" @input="handlePromptInput" @keydown="handlePromptKeydown" @blur="closeMentionMenu" />
          </div>
          <Teleport to="body">
            <div v-if="mentionOpen" ref="mentionMenu" class="creation-mention-menu creation-mention-menu--floating" :style="mentionStyle" role="listbox" aria-label="插入参考素材">
              <button v-for="(item, index) in filteredMentions" :key="item.token" type="button" role="option" :aria-selected="index === mentionIndex" :class="{ 'is-active': index === mentionIndex }" @mousedown.prevent="insertMention(item)">
                <img v-if="item.thumbnail" :src="item.thumbnail" alt="" />
                <component :is="item.kind === 'audio' ? Music : ImageIcon" v-else :size="16" aria-hidden="true" />
                <strong>{{ item.label }}</strong>
                <small>{{ item.title }}</small>
              </button>
              <p v-if="!filteredMentions.length" class="creation-mention-empty">{{ referenceMentions.length ? '没有匹配的参考素材' : '还没有参考素材，点输入框左侧的 + 上传参考图或参考音频' }}</p>
            </div>
          </Teleport>
          <div v-if="creationAttachments.length || audioAttachments.length || maskAttachment" class="creation-attachments" aria-label="参考素材">
            <article v-for="(asset, index) in creationAttachments" :key="asset.id" class="attachment-card" :class="hasImagePreview(asset) ? 'attachment-card--image' : 'attachment-card--file'">
              <img v-if="hasImagePreview(asset)" :src="asset.contentUrl" :alt="asset.title" />
              <div v-else class="attachment-file-copy">
                <span class="attachment-file-icon"><FileText :size="18" /></span>
                <span><strong :title="asset.title">{{ asset.title }}</strong><small>{{ attachmentMeta(asset) }}</small></span>
              </div>
              <span class="attachment-index-label">参考图{{ index }}</span>
              <button class="attachment-remove" type="button" :aria-label="`移除参考图片 ${asset.title}`" title="移除参考图片" @click="removeCreationAttachment(index)"><X :size="13" /></button>
            </article>
            <article v-for="(asset, index) in audioAttachments" :key="asset.id" class="attachment-card attachment-card--audio">
              <span class="attachment-audio-icon"><AudioLines :size="18" /></span>
              <span class="attachment-index-label">参考音频{{ index }}</span>
              <button class="attachment-remove" type="button" :aria-label="`移除参考音频 ${asset.title}`" title="移除参考音频" @click="audioAttachments.splice(index, 1)"><X :size="13" /></button>
            </article>
            <article v-if="maskAttachment" class="attachment-card attachment-card--image attachment-card--mask">
              <button type="button" class="attachment-mask-preview" :aria-label="regionEditAvailable ? '重新编辑蒙版区域' : `蒙版：${maskAttachment.title}`" :title="regionEditAvailable ? '重新编辑蒙版区域' : maskAttachment.title" :disabled="!regionEditAvailable" @click="openRegionEditor"><img :src="maskAttachment.contentUrl" :alt="`蒙版：${maskAttachment.title}`" /></button>
              <span class="attachment-mask-label">蒙版</span>
              <button class="attachment-remove" type="button" :aria-label="`移除蒙版 ${maskAttachment.title}`" title="移除蒙版" @click="maskAttachment = null"><X :size="13" /></button>
            </article>
          </div>
          <div class="creation-controls">
            <div class="creation-control-track">
              <button class="creation-add" type="button" aria-label="添加参考素材" title="添加参考素材" :disabled="uploading" @click="openCreationAttachmentPicker('image')"><Plus :size="20" /></button>
              <button v-if="activeMode === 'videos' && audioReferenceLimit > 0" class="creation-add creation-add--audio" type="button" aria-label="添加参考音频" title="添加参考音频" :disabled="uploading" @click="openCreationAttachmentPicker('audio')"><AudioLines :size="18" /></button>
              <i class="creation-control-divider" aria-hidden="true" />
              <div v-if="activeMode !== 'commerce'" class="creation-mode-switch" role="group" aria-label="创作类型">
                <button type="button" :class="{ 'is-active': activeMode === 'images' }" :aria-pressed="activeMode === 'images'" @click="switchCreationMode('images')">图片</button>
                <button type="button" :class="{ 'is-active': activeMode === 'videos' }" :aria-pressed="activeMode === 'videos'" @click="switchCreationMode('videos')">视频</button>
              </div>
              <div class="creation-option-buttons">
                <button type="button" :class="{ 'is-open': creationMenu === 'model' }" :disabled="!activeCreationModels.length" :aria-label="`模型 ${activeCreationModelLabel}`" :title="activeCreationModels.length ? '选择模型' : '暂无可用模型'" @click.stop="toggleCreationMenu('model', $event)"><ModelBadge v-if="activeCreationModelOption" :model="activeCreationModelOption" size="sm" /><Sparkles v-else :size="16" />{{ activeCreationModelLabel }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode === 'commerce'" type="button" :class="{ 'is-open': creationMenu === 'type' }" @click.stop="toggleCreationMenu('type', $event)"><Images :size="16" /><span class="creation-control-label">类型</span>{{ creationType }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button type="button" :class="{ 'is-open': creationMenu === (activeMode === 'images' ? 'size' : activeMode === 'videos' ? 'aspect' : 'platform') }" @click.stop="toggleCreationMenu(activeMode === 'images' ? 'size' : activeMode === 'videos' ? 'aspect' : 'platform', $event)"><SlidersHorizontal :size="16" /><span class="creation-control-label">{{ activeMode === 'commerce' ? '平台' : '比例' }}</span>{{ activeMode === 'videos' ? videoAspectRatio : activeMode === 'commerce' ? commercePlatform : autoMode }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button type="button" :class="{ 'is-open': creationMenu === (activeMode === 'images' ? 'style' : activeMode === 'videos' ? 'resolution' : 'modules') }" @click.stop="toggleCreationMenu(activeMode === 'images' ? 'style' : activeMode === 'videos' ? 'resolution' : 'modules', $event)"><Blend :size="16" /><span class="creation-control-label">{{ activeMode === 'videos' ? '画质' : '风格' }}</span><template v-if="activeMode === 'images'">{{ imageStyle }}</template><template v-else-if="activeMode === 'videos'">{{ videoResolution }}</template><template v-else>{{ commerceModules }} 模块</template><ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode === 'images' && regionEditAvailable" type="button" title="选择要编辑的区域" @click.stop="openRegionEditor()"><Brush :size="16" />区域编辑</button>
                <button v-if="activeMode === 'images' && regionEditAvailable" type="button" title="上传已有蒙版图片" :disabled="uploading" @click.stop="openFilePicker('mask')"><Blend :size="16" />上传蒙版</button>
                <button v-if="activeMode === 'images'" type="button" :class="{ 'is-open': creationMenu === 'imageResolution' }" :aria-label="`图片分辨率，当前为 ${imageResolution}`" :title="`图片分辨率：${imageResolution}`" @click.stop="toggleCreationMenu('imageResolution', $event)"><BadgeCheck :size="16" />{{ imageResolution }}<ChevronDown class="creation-control-chevron" :size="14" /></button>
                <button v-if="activeMode === 'videos'" type="button" :class="{ 'is-open': creationMenu === 'duration' }" :aria-label="`视频时长，当前为 ${videoDuration} 秒`" :title="`视频时长：${videoDuration} 秒`" @click.stop="toggleCreationMenu('duration', $event)"><Clock3 :size="16" />{{ videoDuration }} 秒<ChevronDown class="creation-control-chevron" :size="14" /></button>
              </div>
              <PluginSelector v-model="creationPluginId" v-model:open="creationPluginOpen" :capability="creationPluginCapability" compact />
              <div v-if="activeMode !== 'videos'" class="creation-more-wrap">
                <button ref="creationMoreTrigger" class="creation-more-button" :class="{ 'is-active': creationOptionsOpen }" type="button" aria-label="更多生成设置" title="更多设置" :aria-expanded="creationOptionsOpen" @click.stop="toggleMoreOptions"><Settings2 :size="17" /><span>更多</span><ChevronDown class="creation-control-chevron" :size="13" /></button>
                <Teleport to="body">
                <div v-if="creationOptionsOpen" ref="creationMorePanel" class="creation-more-panel creation-more-panel--floating" :style="creationMorePanelStyle" aria-label="更多生成设置">
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('count', $event)"><Layers3 :size="16" />{{ imageCount }} 张<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('format', $event)"><FileType2 :size="16" />{{ outputFormat }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'images'" type="button" @click.stop="toggleCreationMenu('background', $event)"><ImageIcon :size="16" />{{ imageBackground }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'commerce'" type="button" @click.stop="toggleCreationMenu('format', $event)"><FileType2 :size="16" />{{ outputFormat }}<ChevronDown :size="13" /></button>
                  <button v-if="activeMode === 'commerce'" type="button" @click.stop="toggleCreationMenu('background', $event)"><ImageIcon :size="16" />{{ imageBackground }}<ChevronDown :size="13" /></button>
                </div>
                </Teleport>
              </div>
            </div>
            <button class="creation-submit composer-send" :class="{ 'is-listening': voiceListening && voiceTarget === 'creation' }" :type="canSubmitCreation ? 'submit' : 'button'" :disabled="hasCreationInput && !activeCreationModelAvailable" :aria-label="canSubmitCreation ? '开始生成' : hasCreationInput ? '暂无可用模型' : voiceListening && voiceTarget === 'creation' ? '停止语音输入' : '语音输入'" :title="hasCreationInput && !activeCreationModelAvailable ? '暂无可用模型，请联系管理员或添加个人 API 密钥' : undefined" @click="!hasCreationInput && toggleVoice('creation')"><ArrowUp v-if="hasCreationInput" :size="20" /><AudioLines v-else :size="18" /></button>
          </div>
          <Teleport to="body">
            <div v-if="creationMenu" ref="creationOptionsMenu" class="creation-options-menu creation-options-menu--floating" :class="`creation-options-menu--${creationMenu}`" :style="creationMenuStyle">
              <ModelCatalogPicker v-if="creationMenu === 'model'" :models="activeCreationModels" :model-value="activeCreationModel" :title="creationMenuTitle" @select="selectCreationOption" />
              <strong v-else>{{ creationMenuTitle }}</strong>
              <div v-if="creationMenu === 'size'" class="creation-ratio-grid">
                <button v-for="option in creationMenuOptions" :key="option" type="button" :class="{ 'is-active': isCreationOptionActive(option) }" @click="selectCreationOption(option)"><span class="creation-ratio-shape" :class="ratioShapeClass(option)"><i /><i v-if="option === '自动'" /></span><span>{{ option }}</span></button>
              </div>
              <div v-else-if="creationMenu === 'duration'" class="creation-duration-menu">
                <button v-for="option in creationMenuOptions" :key="option" type="button" :class="{ 'is-active': isCreationOptionActive(option) }" @click="selectCreationOption(option)"><span>{{ creationOptionLabel(option) }}</span><Check v-if="isCreationOptionActive(option)" :size="15" /></button>
                <label class="creation-duration-custom"><span>自定义</span><input type="number" :min="1" :max="videoDurationLimit" step="1" :value="videoDuration" aria-label="自定义视频秒数" @change="setCustomVideoDuration(($event.target as HTMLInputElement).value)" /><span>秒</span></label>
                <p class="creation-duration-hint">支持 1–{{ videoDurationLimit }} 秒，超出会自动调整。</p>
              </div>
              <button v-else-if="creationMenu !== 'model'" v-for="option in creationMenuOptions" :key="option" type="button" :class="{ 'is-active': isCreationOptionActive(option) }" @click="selectCreationOption(option)"><img v-if="creationMenu === 'style'" class="creation-style-thumb" :src="styleThumbnail(option)" alt="" /><span>{{ creationOptionLabel(option) }}</span><Check v-if="isCreationOptionActive(option)" :size="15" /></button>
            </div>
          </Teleport>
        </form>

        <section v-if="activeMode === 'images'" class="creation-tools" aria-label="图片快捷工具">
          <button v-for="tool in imageTools" :key="tool.id" type="button" :class="{ 'is-active': selectedImageToolId === tool.id }" :aria-pressed="selectedImageToolId === tool.id" @click="selectImageTool(tool)">
            <span>{{ tool.title }}</span><img v-if="tool.imageUrl" :src="tool.imageUrl" :alt="`${tool.title}示例`" /><span v-else class="creation-tool-fallback-icon" aria-hidden="true"><component :is="imageToolIcon(tool)" :size="22" /></span>
          </button>
        </section>

        <section class="inspiration-section">
          <header>
            <h2>{{ activeMode === 'images' || activeMode === 'videos' ? '灵感中心' : t('studio.inspiration') }}</h2>
            <div class="inspiration-header-actions">
              <button v-if="activeMode === 'images' || activeMode === 'videos'" class="inspiration-more" type="button" @click="openPromptLibrary(activeMode === 'videos' ? 'VIDEO' : 'IMAGE')">更多灵感<ArrowRight :size="16" /></button>
              <nav class="inspiration-navigation" aria-label="浏览生成灵感">
                <button class="inspiration-arrow inspiration-arrow--previous" type="button" aria-label="上一组" title="上一组" :disabled="!canScrollInspirationPrevious" @click="scrollInspiration(-1)"><ChevronLeft :size="20" /></button>
                <button class="inspiration-arrow inspiration-arrow--next" type="button" aria-label="下一组" title="下一组" :disabled="!canScrollInspirationNext" @click="scrollInspiration(1)"><ChevronRight :size="20" /></button>
              </nav>
            </div>
          </header>
          <div v-if="inspirationError" class="inspiration-error" role="alert"><span><RefreshCw :size="16" />{{ inspirationError }}</span><button type="button" @click="retryInspirations"><RefreshCw :size="15" />重新加载</button></div>
          <div class="inspiration-browser">
            <div ref="inspirationRail" class="inspiration-rail" @scroll="syncInspirationNavigation">
              <div v-if="inspirationLoading" class="inspiration-loading" aria-label="正在加载灵感"><i v-for="index in 5" :key="index" /></div>
              <p v-else-if="!activeInspirations.length && !inspirationError" class="inspiration-empty">暂无可用灵感</p>
              <button v-for="item in activeInspirations" :key="item.id" type="button" class="inspiration-card" :class="{ 'is-selected': selectedInspirationId === item.id, 'is-video': activeMode === 'videos' }" :aria-label="`查看灵感：${item.title}`" @click="openInspiration(item)">
                <video v-if="activeMode === 'videos' && item.videoUrl" :src="item.videoUrl" :poster="item.imageUrl" muted loop playsinline preload="metadata" :aria-label="`${item.title} 视频预览`" @mouseenter="playInspirationVideo" @mouseleave="pauseInspirationVideo" />
                <img v-else :src="item.imageUrl" :alt="item.title" />
                <span v-if="item.badge">{{ item.badge }}</span>
                <i v-if="activeMode === 'videos'" class="inspiration-card__play" aria-hidden="true"><Play :size="18" fill="currentColor" /></i>
                <strong>{{ item.title }}</strong>
              </button>
            </div>
          </div>
        </section>

        <section class="creation-output">
          <h2>{{ activeMode === 'images' ? t('studio.myImages') : activeMode === 'videos' ? t('studio.myVideos') : t('studio.myCommerce') }}</h2>
          <template v-if="activeMode === 'videos'">
            <div v-if="pendingVideoRuns.length" class="video-runs video-runs--pending">
              <article v-for="run in pendingVideoRuns" :key="run.id" class="video-run-card" :class="`is-${run.status.toLowerCase()}`">
                <div class="video-run-card__stage"><LoaderCircle :size="26" /><strong>正在生成视频{{ run.progress !== undefined ? ` · ${run.progress}%` : '' }}</strong><small>{{ run.request.resolution || '720p' }} · {{ run.request.duration || 5 }} 秒 · {{ run.request.aspectRatio || '16:9' }} · 已用 {{ elapsedSeconds(run) }} 秒</small><div v-if="run.progress !== undefined" class="video-run-card__progress" role="progressbar" :aria-valuenow="run.progress"><span :style="{ width: `${run.progress}%` }" /></div></div>
                <footer><span><strong>{{ run.model }}</strong></span><nav><button type="button" title="停止生成" :disabled="store.cancelingJobId === run.id" @click="stopGeneration(run)"><Square :size="14" fill="currentColor" /></button></nav></footer>
                <p>{{ run.prompt }}</p>
              </article>
            </div>
            <template v-if="modeAssets.length">
              <AssetGrid :assets="visibleModeAssets" variant="gallery" :deletable="auth.isAuthenticated" reusable regeneratable local-supported :local-saved-ids="localSavedIds" @delete="deleteAsset" @quote="useAssetPrompt" @regenerate="retryAssetGeneration" @save-local="saveAssetLocally" @remove-local="removeLocalCopy" />
              <button v-if="visibleModeAssets.length < modeAssets.length" class="creation-output__more" type="button" @click="modeAssetLimit += 12">加载更多视频</button>
            </template>
            <div v-else-if="auth.isAuthenticated && !store.workspaceHydrated" class="creation-gallery-skeleton" aria-label="正在加载视频"><i v-for="index in 6" :key="index" /></div>
            <p v-else-if="!pendingVideoRuns.length">你创建的视频会显示在这里</p>
          </template>
          <div v-else-if="activeMode === 'commerce' && commerceRuns.length" class="commerce-runs">
            <div v-for="run in commerceRuns" :key="run.id" class="commerce-run-card" :class="{ 'is-running': generationState(run).isActive, 'is-clickable': Boolean(run.assets.length) }" :role="run.assets.length ? 'button' : undefined" :tabindex="run.assets.length ? 0 : undefined" @click="run.assets.length && (selectedCommerceRun = run)" @keydown.enter="run.assets.length && (selectedCommerceRun = run)">
              <div class="commerce-run-card__preview">
                <template v-if="run.assets.length"><img v-for="asset in run.assets.slice(0, 4)" :key="asset.id" :src="asset.contentUrl" :alt="asset.moduleLabel || asset.title" /><span><Images :size="14" />{{ run.assets.length }} 张</span></template>
                <span v-else class="commerce-run-card__progress"><LoaderCircle v-if="generationState(run).isActive" :size="22" /><span>{{ generationState(run).isFailed ? run.error || '生成失败' : generationState(run).isCancelled ? '生成已停止' : '正在生成商品图' }}</span><button v-if="generationState(run).canCancel" type="button" class="commerce-run-card__stop" :disabled="store.cancelingJobId === run.id" aria-label="停止商品图生成" title="停止商品图生成" @click.stop="stopGeneration(run)"><LoaderCircle v-if="store.cancelingJobId === run.id" class="generation-stop-spin" :size="14" /><Square v-else :size="14" fill="currentColor" />{{ store.cancelingJobId === run.id ? '停止中' : '停止生成' }}</button></span>
              </div>
              <span class="commerce-run-card__copy"><strong>{{ run.request.creationType || '商品素材包' }}</strong><small>{{ run.prompt }}</small></span>
            </div>
          </div>
          <div v-else-if="auth.isAuthenticated && !store.workspaceHydrated" class="creation-gallery-skeleton" aria-label="正在加载图片"><i v-for="index in 6" :key="index" /></div>
          <template v-else-if="modeAssets.length">
            <AssetGrid :assets="visibleModeAssets" variant="gallery" :deletable="auth.isAuthenticated" :reusable="activeMode === 'images'" :regeneratable="activeMode === 'images'" :region-editable="activeMode === 'images' && regionEditAvailable" local-supported :local-saved-ids="localSavedIds" @delete="deleteAsset" @reuse="useGeneratedAssetAsReference" @quote="useAssetPrompt" @regenerate="retryAssetGeneration" @region-edit="openRegionEditorForAsset" @save-local="saveAssetLocally" @remove-local="removeLocalCopy" />
            <button v-if="visibleModeAssets.length < modeAssets.length" class="creation-output__more" type="button" @click="modeAssetLimit += 12">加载更多图片</button>
          </template>
          <p v-else>{{ activeMode === 'images' ? '你创建的图片会显示在这里' : '你制作的商品素材包和详情页会显示在这里' }}</p>
        </section>
      </div>
    </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowRight, ArrowUp, AudioLines, BadgeCheck, Blend, Brush, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, FileText, FileType2, Image as ImageIcon, Images, Layers3, LoaderCircle, Music, Play, Plus, RefreshCw, Settings2, SlidersHorizontal, Sparkles, Square, X,
} from 'lucide-vue-next'
import AssetGrid from '../AssetGrid.vue'
import ModelCatalogPicker from '../ModelCatalogPicker.vue'
import PluginSelector from '../PluginSelector.vue'
import { useAuthStore } from '../../stores/auth'
import { useStudioStore } from '../../stores/studio'
import type { GenerationRun, PluginCapability, StudioAsset, StudioMode } from '../../types'
import { findCatalogModel, type CatalogModel } from '../../utils/model-catalog'
import { resolveGenerationRunState } from '../../utils/generation-run-state'
import ModelBadge from '../common/ModelBadge.vue'
import { attachmentMeta, hasImagePreview, type CreationMenu, type ImageTool, type Inspiration } from './creation-shared'

const props = defineProps<{
  activeMode: StudioMode
  modelCatalogError: string
  activeCreationModels: CatalogModel[]
  activeCreationModel: string
  activeCreationModelLabel: string
  activeCreationModelAvailable: boolean
  activeImageCapabilities: { supportsMask: boolean }
  regionEditAvailable: boolean
  creationPluginCapability: PluginCapability
  canSubmitCreation: boolean
  hasCreationInput: boolean
  creationPromptPlaceholder: string
  uploading: boolean
  voiceListening: boolean
  voiceTarget: 'chat' | 'creation'
  creationMenu: CreationMenu
  creationMenuStyle: Record<string, string>
  creationMenuTitle: string
  creationMenuOptions: string[]
  creationOptionsOpen: boolean
  creationMorePanelStyle: Record<string, string>
  creationType: string
  videoAspectRatio: string
  commercePlatform: string
  autoMode: string
  imageStyle: string
  videoResolution: string
  videoDuration: number
  videoDurationLimit: number
  setCustomVideoDuration: (value: string) => void
  commerceModules: number
  imageResolution: string
  imageCount: number
  outputFormat: string
  imageBackground: string
  creationAttachments: StudioAsset[]
  audioAttachments: StudioAsset[]
  localSavedIds: string[]
  saveAssetLocally: (asset: StudioAsset) => void
  removeLocalCopy: (asset: StudioAsset) => void
  referenceMentions: Array<{ token: string; label: string; kind: 'image' | 'audio'; thumbnail: string; title: string }>
  audioReferenceLimit: number
  imageReferenceLimit: number
  imageTools: ImageTool[]
  selectedImageToolId: string
  activeInspirations: Inspiration[]
  inspirationLoading: boolean
  inspirationError: string
  selectedInspirationId: string
  pendingVideoRuns: GenerationRun[]
  modeAssets: StudioAsset[]
  visibleModeAssets: StudioAsset[]
  commerceRuns: GenerationRun[]
  submitGeneration: () => void
  resizeGenerationInput: () => void
  collapseWorkspacePopovers: () => void
  openFilePicker: (purpose: 'chat-file' | 'creation' | 'mask' | 'library') => void
  openCreationAttachmentPicker: (kind: 'image' | 'audio') => void
  openRegionEditor: () => void
  openRegionEditorForAsset: (asset: StudioAsset) => void
  switchCreationMode: (mode: 'images' | 'videos') => void
  toggleCreationMenu: (menu: NonNullable<CreationMenu>, event: MouseEvent) => void
  toggleMoreOptions: () => void
  toggleVoice: (target?: 'chat' | 'creation') => void
  selectImageTool: (tool: ImageTool) => void
  openPromptLibrary: (type?: 'IMAGE' | 'VIDEO' | 'TEXT') => void
  openInspiration: (item: Inspiration) => void
  playInspirationVideo: (event: Event) => void
  pauseInspirationVideo: (event: Event) => void
  retryInspirations: () => void
  stopGeneration: (generation: GenerationRun) => void
  deleteAsset: (assetId: string) => void
  useAssetPrompt: (asset: StudioAsset) => void
  retryAssetGeneration: (asset: StudioAsset) => void
  useGeneratedAssetAsReference: (asset: StudioAsset, generation?: GenerationRun) => void
  selectCreationOption: (option: string) => void
  isCreationOptionActive: (option: string) => boolean
  ratioShapeClass: (option: string) => string
  styleThumbnail: (option: string) => string
  creationOptionLabel: (option: string) => string
  imageToolIcon: (tool: ImageTool) => Component
  refreshModelCatalog: () => void
}>()
const generationPrompt = defineModel<string>('generationPrompt', { required: true })
const maskAttachment = defineModel<StudioAsset | null>('maskAttachment', { required: true })
const creationPluginId = defineModel<string>('creationPluginId', { required: true })
const creationPluginOpen = defineModel<boolean>('creationPluginOpen', { required: true })
const modeAssetLimit = defineModel<number>('modeAssetLimit', { required: true })
const selectedCommerceRun = defineModel<GenerationRun | null>('selectedCommerceRun', { required: true })
function generationState(generation: GenerationRun) { return resolveGenerationRunState(generation.status) }

const store = useStudioStore()
const auth = useAuthStore()
const { t } = useI18n()
const creationComposer = ref<HTMLFormElement | null>(null)
const generationInput = ref<HTMLTextAreaElement | null>(null)
const activeCreationModelOption = computed(() => findCatalogModel(props.activeCreationModels, props.activeCreationModel))
const creationMoreTrigger = ref<HTMLButtonElement | null>(null)
const creationMorePanel = ref<HTMLElement | null>(null)
const creationOptionsMenu = ref<HTMLElement | null>(null)
const inspirationRail = ref<HTMLElement | null>(null)

onMounted(() => {
  window.addEventListener('resize', repositionMentionMenu)
  window.addEventListener('scroll', repositionMentionMenu, true)
  document.addEventListener('xinyue:close-popovers', closeMentionMenu)
})

onUnmounted(() => {
  window.clearInterval(elapsedTimer)
  window.removeEventListener('resize', repositionMentionMenu)
  window.removeEventListener('scroll', repositionMentionMenu, true)
  document.removeEventListener('xinyue:close-popovers', closeMentionMenu)
})
const canScrollInspirationPrevious = ref(false)
const canScrollInspirationNext = ref(false)

const mentionOpen = ref(false)
const mentionIndex = ref(0)
const mentionQuery = ref('')
/** 视频任务卡片的已用时间需要每秒刷新，其它页面不跑定时器。 */
const elapsedTick = ref(Date.now())
let elapsedTimer = 0

function elapsedSeconds(run: { createdAt: number }) {
  return Math.max(0, Math.round((elapsedTick.value - run.createdAt) / 1000))
}

watch(() => props.pendingVideoRuns.length, (count: number) => {
  window.clearInterval(elapsedTimer)
  elapsedTimer = count ? window.setInterval(() => { elapsedTick.value = Date.now() }, 1000) : 0
}, { immediate: true })
const mentionMenu = ref<HTMLElement | null>(null)
const mentionStyle = ref<Record<string, string>>({ visibility: 'hidden' })

const filteredMentions = computed(() => {
  const query = mentionQuery.value.trim().toLowerCase()
  if (!query) return props.referenceMentions
  return props.referenceMentions.filter((item) => item.label.toLowerCase().includes(query) || item.title.toLowerCase().includes(query))
})

function handlePromptInput(event: Event) {
  props.resizeGenerationInput()
  const element = event.target as HTMLTextAreaElement
  syncMentionMenu(element.value.slice(0, element.selectionStart ?? 0))
}

function syncMentionMenu(before: string) {
  const match = /@([^\s@]{0,12})$/.exec(before)
  mentionQuery.value = match ? match[1] : ''
  mentionIndex.value = 0
  if (!match) { mentionOpen.value = false; return }
  mentionOpen.value = true
  void openMentionMenu()
}

async function openMentionMenu() {
  mentionStyle.value = { visibility: 'hidden' }
  await nextTick()
  positionMentionMenu()
}

function positionMentionMenu() {
  const anchor = generationInput.value
  const menu = mentionMenu.value
  if (!mentionOpen.value || !anchor || !menu) return
  const rect = anchor.getBoundingClientRect()
  const inset = 12
  const gap = 8
  const width = Math.min(340, Math.max(240, rect.width))
  const height = menu.scrollHeight || 120
  const left = Math.min(window.innerWidth - width - inset, Math.max(inset, rect.left))
  const top = rect.top - height - gap >= inset
    ? rect.top - height - gap
    : Math.min(window.innerHeight - height - inset, rect.bottom + gap)
  mentionStyle.value = { left: `${left}px`, top: `${top}px`, width: `${width}px`, visibility: 'visible' }
}

function repositionMentionMenu() {
  if (mentionOpen.value) positionMentionMenu()
}

function closeMentionMenu() { mentionOpen.value = false }

function insertMention(item: { token: string }) {
  const element = generationInput.value
  const caret = element?.selectionStart ?? generationPrompt.value.length
  const before = generationPrompt.value.slice(0, caret)
  const match = /@([^\s@]{0,12})$/.exec(before)
  const start = match ? caret - match[0].length : caret
  generationPrompt.value = `${generationPrompt.value.slice(0, start)}${item.token} ${generationPrompt.value.slice(caret)}`
  mentionOpen.value = false
  if (!element) return
  const position = start + item.token.length + 1
  void nextTick(() => { element.focus(); element.setSelectionRange(position, position) })
}

function handlePromptKeydown(event: KeyboardEvent) {
  if (!mentionOpen.value || !filteredMentions.value.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    mentionIndex.value = (mentionIndex.value + step + filteredMentions.value.length) % filteredMentions.value.length
    return
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    insertMention(filteredMentions.value[Math.min(mentionIndex.value, filteredMentions.value.length - 1)])
    return
  }
  if (event.key === 'Escape') { event.preventDefault(); closeMentionMenu() }
}

/** 删除参考图后重排 prompt 里的 @参考图N 标记，避免指向错图。 */
function removeCreationAttachment(index: number) {
  if (!props.creationAttachments[index]) return
  props.creationAttachments.splice(index, 1)
  generationPrompt.value = generationPrompt.value
    .replace(/@参考图(\d+)/g, (match, digits: string) => {
      const position = Number(digits)
      if (position === index) return ''
      return position > index ? `@参考图${position - 1}` : match
    })
    .replace(/ {2,}/g, ' ')
    .trimEnd()
}

function syncInspirationNavigation() {
  const rail = inspirationRail.value
  if (!rail) { canScrollInspirationPrevious.value = false; canScrollInspirationNext.value = false; return }
  const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth)
  canScrollInspirationPrevious.value = rail.scrollLeft > 2
  canScrollInspirationNext.value = rail.scrollLeft < maximum - 2
}
function scrollInspiration(direction: number) {
  const rail = inspirationRail.value
  if (!rail) return
  rail.scrollBy({ left: direction * Math.max(470, rail.clientWidth * 0.72), behavior: 'smooth' })
}

defineExpose({
  creationComposerEl: () => creationComposer.value,
  generationInputEl: () => generationInput.value,
  creationMoreTriggerEl: () => creationMoreTrigger.value,
  creationMorePanelEl: () => creationMorePanel.value,
  creationOptionsMenuEl: () => creationOptionsMenu.value,
  syncInspirationNavigation,
})
</script>
