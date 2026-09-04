<template>
  <div class="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div class="onboarding-card">
      <header class="onboarding-header">
        <div class="onboarding-header__meta">
          <span class="onboarding-header__brand">ONLYART</span>
          <span v-if="previewMode" class="onboarding-preview-badge">预览模式</span>
        </div>
        <div class="onboarding-header__steps" :aria-label="`第 ${currentStep} 步，共 4 步`">
          <span
            v-for="step in 4"
            :key="step"
            class="onboarding-step-dot"
            :class="{
              'is-active': currentStep === step,
              'is-completed': currentStep > step,
            }"
          />
        </div>
      </header>

      <main class="onboarding-body">
        <p v-if="previewMode" class="onboarding-preview-notice">预览操作不会创建密钥或保存引导状态。</p>
        <!-- 第一步：体验偏好 -->
        <section v-if="currentStep === 1" class="onboarding-step">
          <div class="onboarding-section-intro">
            <h2 id="onboarding-title">选择你的使用偏好</h2>
            <p>告诉我们你的使用习惯，以便为你提供更合适的体验。</p>
          </div>
          <div class="onboarding-choice-grid">
            <button
              type="button"
              class="onboarding-choice-card"
              :class="{ 'is-selected': selectedExperience === 'BEGINNER' }"
              @click="handleSelectExperience('BEGINNER')"
            >
              <span class="onboarding-choice-card__icon">
                <Sparkles :size="20" />
              </span>
              <strong>新手上路</strong>
              <small>挑选需要的创作能力，并快捷配置推荐的模型分组与密钥。</small>
            </button>
            <button
              type="button"
              class="onboarding-choice-card"
              :class="{ 'is-selected': selectedExperience === 'EXPERIENCED' }"
              @click="handleSelectExperience('EXPERIENCED')"
            >
              <span class="onboarding-choice-card__icon">
                <Zap :size="20" />
              </span>
              <strong>我有经验</strong>
              <small>跳过能力向导，直接进入完整工作台自由探索。</small>
            </button>
          </div>
        </section>

        <!-- 第二步：新手用途多选 -->
        <section v-else-if="currentStep === 2" class="onboarding-step">
          <div class="onboarding-section-intro">
            <h2 id="onboarding-title">选择你想使用的能力</h2>
            <p>多选你感兴趣的创作领域，至少选择一项。</p>
          </div>
          <div class="onboarding-capability-grid">
            <button
              v-for="cap in capabilityOptions"
              :key="cap.id"
              type="button"
              class="onboarding-capability-card"
              :class="{ 'is-selected': selectedCapabilities.includes(cap.id) }"
              @click="toggleCapability(cap.id)"
            >
              <div class="onboarding-capability-card__header">
                <span class="onboarding-capability-card__icon">
                  <component :is="cap.icon" :size="18" />
                </span>
                <span class="onboarding-capability-card__check">
                  <Check :size="12" />
                </span>
              </div>
              <strong>{{ cap.label }}</strong>
              <small>{{ cap.description }}</small>
            </button>
          </div>
        </section>

        <!-- 第三步：分组多选与批量创建 -->
        <section v-else-if="currentStep === 3" class="onboarding-step">
          <div class="onboarding-section-intro">
            <h2 id="onboarding-title">配置模型分组密钥</h2>
            <p>已为你匹配可用的 OnlyCode 分组，可直接批量创建并接入密钥。</p>
          </div>

          <div v-if="groupsLoading" class="onboarding-loading-state">
            <Loader2 class="is-spinning" :size="22" />
            <span>正在加载可用分组...</span>
          </div>

          <div v-else-if="groupsError" class="onboarding-empty-state">
            <AlertCircle :size="22" />
            <span>{{ groupsError }}</span>
            <button type="button" class="onboarding-btn" @click="loadOnlyCodeGroups">重试加载</button>
          </div>

          <div v-else-if="!relevantGroups.length" class="onboarding-empty-state">
            <p>暂无与所选能力匹配的开放分组，你可以稍后在设置中接入。</p>
          </div>

          <div v-else class="onboarding-groups-wrapper">
            <p class="onboarding-recommendation-note">已为每类用途预选倍率较低的分组，你也可以按需多选。</p>
            <div
              v-for="item in relevantGroups"
              :key="item.name"
              class="onboarding-group-item"
              :class="{
                'is-selected': groupSelections[item.name]?.selected,
                'is-success': groupSelections[item.name]?.status === 'success',
                'is-error': groupSelections[item.name]?.status === 'error',
              }"
            >
              <div class="onboarding-group-item__header">
                <div class="onboarding-group-item__left">
                  <input
                    v-model="groupSelections[item.name].selected"
                    type="checkbox"
                    class="onboarding-checkbox"
                    :disabled="groupSelections[item.name]?.status === 'success' || batchBusy"
                  />
                  <span class="onboarding-group-item__name">{{ item.name }}</span>
                  <span class="onboarding-group-item__ratio">倍率: {{ item.ratio }}x</span>
                </div>
                <div class="onboarding-group-item__status">
                  <span
                    v-if="groupSelections[item.name]?.status === 'success'"
                    class="onboarding-status-badge onboarding-status-badge--success"
                  >
                    <Check :size="12" /> 已接入
                  </span>
                  <span
                    v-else-if="groupSelections[item.name]?.status === 'provisioning'"
                    class="onboarding-status-badge onboarding-status-badge--loading"
                  >
                    <Loader2 class="is-spinning" :size="12" /> 创建中
                  </span>
                  <span
                    v-else-if="groupSelections[item.name]?.status === 'error'"
                    class="onboarding-status-badge onboarding-status-badge--error"
                  >
                    <AlertCircle :size="12" /> 失败
                  </span>
                </div>
              </div>

              <span class="onboarding-group-item__capabilities">{{ groupCapabilityLabels(item) }}</span>
              <div v-if="item.models?.length" class="onboarding-group-item__models">
                <span
                  v-for="model in item.models.slice(0, 5)"
                  :key="model"
                  class="onboarding-model-tag"
                >
                  {{ model }}
                </span>
                <span v-if="item.models.length > 5" class="onboarding-model-tag">
                  +{{ item.models.length - 5 }}
                </span>
              </div>

              <div class="onboarding-group-item__input-row">
                <input
                  v-model.trim="groupSelections[item.name].keyName"
                  type="text"
                  class="onboarding-group-item__input"
                  maxlength="50"
                  placeholder="密钥名称"
                  :disabled="groupSelections[item.name]?.status === 'success' || batchBusy"
                />
                <button
                  v-if="groupSelections[item.name]?.status === 'error'"
                  type="button"
                  class="onboarding-retry-btn"
                  :disabled="batchBusy"
                  @click="createSingleGroup(item.name)"
                >
                  <RefreshCw :size="12" /> 重试
                </button>
              </div>
              <small v-if="groupSelections[item.name]?.errorMessage" class="onboarding-group-item__error">
                {{ groupSelections[item.name].errorMessage }}
              </small>
            </div>
          </div>
        </section>

        <!-- 第四步：欢迎与完成 -->
        <section v-else-if="currentStep === 4" class="onboarding-step">
          <div class="onboarding-section-intro">
            <h2 id="onboarding-title">准备就绪，开启创作</h2>
            <p>你的工作空间已就绪，点击下方入口即可直接开始体验。</p>
          </div>
          <div class="onboarding-welcome-content">
            <div class="onboarding-entrance-grid">
              <button
                v-for="entry in availableEntrances"
                :key="entry.path"
                type="button"
                class="onboarding-entrance-card"
                :disabled="completing"
                @click="completeAndNavigate(entry.path)"
              >
                <span class="onboarding-entrance-card__icon">
                  <component :is="entry.icon" :size="20" />
                </span>
                <div>
                  <strong>{{ entry.title }}</strong>
                  <small>{{ entry.description }}</small>
                </div>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer class="onboarding-footer">
        <div class="onboarding-footer__left">
          <button
            v-if="previewMode"
            type="button"
            class="onboarding-btn onboarding-btn--subtle"
            :disabled="batchBusy || completing"
            @click="exitPreview"
          >
            退出预览
          </button>
          <button
            v-if="currentStep > 1 && currentStep < 4"
            type="button"
            class="onboarding-btn onboarding-btn--subtle"
            :disabled="batchBusy"
            @click="handlePrevStep"
          >
            上一步
          </button>
          <button
            v-if="currentStep === 3"
            type="button"
            class="onboarding-btn onboarding-btn--subtle"
            :disabled="batchBusy"
            @click="currentStep = 4"
          >
            稍后配置
          </button>
        </div>

        <div class="onboarding-footer__right">
          <button
            v-if="currentStep === 1"
            type="button"
            class="onboarding-btn onboarding-btn--primary"
            :disabled="!selectedExperience"
            @click="handleNextFromStep1"
          >
            下一步
          </button>
          <button
            v-else-if="currentStep === 2"
            type="button"
            class="onboarding-btn onboarding-btn--primary"
            :disabled="!selectedCapabilities.length"
            @click="handleNextFromStep2"
          >
            下一步
          </button>
          <template v-else-if="currentStep === 3">
            <button
              v-if="hasPendingBatchItems"
              type="button"
              class="onboarding-btn onboarding-btn--primary"
              :disabled="batchBusy"
              @click="runBatchProvision"
            >
              <Loader2 v-if="batchBusy" class="is-spinning" :size="14" />
              <KeyRound v-else :size="14" />
              {{ batchBusy ? '创建中...' : `创建所选密钥 (${pendingBatchCount})` }}
            </button>
            <button
              v-else
              type="button"
              class="onboarding-btn onboarding-btn--primary"
              @click="currentStep = 4"
            >
              下一步
            </button>
          </template>
          <button
            v-else-if="currentStep === 4"
            type="button"
            class="onboarding-btn onboarding-btn--primary"
            :disabled="completing"
            @click="completeAndNavigate('/chat')"
          >
            <Loader2 v-if="completing" class="is-spinning" :size="14" />
            <span>{{ completing ? '正在完成...' : '进入工作台' }}</span>
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import {
  AlertCircle,
  Check,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Video as VideoIcon,
  Zap,
} from 'lucide-vue-next'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/auth'
import { recommendGroupNames } from './recommendations'
import type {
  ApiCredential,
  CapabilityType,
  ExperienceLevel,
  OnlyCodeGroupInfo,
  UpdateOnboardingDto,
} from '../shell/types'

const props = defineProps<{
  apiCredentials?: ApiCredential[]
  previewMode?: boolean
}>()

const emit = defineEmits<{
  completed: []
  'refresh-credentials': []
}>()

const router = useRouter()
const message = useMessage()
const auth = useAuthStore()

const currentStep = ref<number>(1)
const selectedExperience = ref<ExperienceLevel>('')
const selectedCapabilities = ref<CapabilityType[]>([])

const capabilityOptions = [
  {
    id: 'CHAT' as CapabilityType,
    label: '对话交互',
    description: '智能多轮问答、代码辅助与逻辑分析',
    icon: MessageSquare,
  },
  {
    id: 'IMAGE' as CapabilityType,
    label: '图片创作',
    description: '文生图、图生图与风格化渲染',
    icon: ImageIcon,
  },
  {
    id: 'VIDEO' as CapabilityType,
    label: '视频创作',
    description: '文生视频、图生视频与动态镜头',
    icon: VideoIcon,
  },
]

// 第一步操作
function handleSelectExperience(exp: ExperienceLevel) {
  selectedExperience.value = exp
  if (exp === 'EXPERIENCED') {
    currentStep.value = 4
  } else {
    currentStep.value = 2
  }
}

function handleNextFromStep1() {
  if (selectedExperience.value === 'EXPERIENCED') {
    currentStep.value = 4
  } else if (selectedExperience.value === 'BEGINNER') {
    currentStep.value = 2
  }
}

// 第二步操作
function toggleCapability(cap: CapabilityType) {
  const index = selectedCapabilities.value.indexOf(cap)
  if (index >= 0) {
    if (selectedCapabilities.value.length > 1) {
      selectedCapabilities.value.splice(index, 1)
    } else {
      message.info('请至少保留一项能力')
    }
  } else {
    selectedCapabilities.value.push(cap)
  }
}

function handleNextFromStep2() {
  if (!selectedCapabilities.value.length) return
  currentStep.value = 3
  void loadOnlyCodeGroups()
}

function handlePrevStep() {
  if (currentStep.value === 4 && selectedExperience.value === 'EXPERIENCED') {
    currentStep.value = 1
  } else if (currentStep.value > 1) {
    currentStep.value -= 1
  }
}

// 第三步分组状态
interface GroupItemState {
  selected: boolean
  keyName: string
  status: 'idle' | 'provisioning' | 'success' | 'error'
  errorMessage?: string
}

const groupsLoading = ref(false)
const groupsError = ref('')
const onlyCodeGroups = ref<OnlyCodeGroupInfo[]>([])
const groupSelections = reactive<Record<string, GroupItemState>>({})
const batchBusy = ref(false)

async function loadOnlyCodeGroups() {
  groupsLoading.value = true
  groupsError.value = ''
  try {
    const data = await api<OnlyCodeGroupInfo[]>('/users/me/only-code-groups')
    onlyCodeGroups.value = Array.isArray(data) ? data : []
    initGroupSelections()
  } catch (error) {
    groupsError.value = error instanceof Error ? error.message : '加载 OnlyCode 分组失败'
  } finally {
    groupsLoading.value = false
  }
}

function initGroupSelections() {
  const namePrefix = auth.displayName || 'user'
  const connectedGroups = new Set(props.apiCredentials?.map((item) => item.provisionKey).filter((group): group is string => Boolean(group)) || [])
  for (const group of onlyCodeGroups.value) {
    const alreadyConnected = connectedGroups.has(group.name)
    if (!groupSelections[group.name]) {
      groupSelections[group.name] = {
        selected: false,
        keyName: `onlyart-${namePrefix}-${group.name}`,
        status: alreadyConnected ? 'success' : 'idle',
      }
    }
  }
  for (const name of recommendGroupNames(onlyCodeGroups.value, selectedCapabilities.value, connectedGroups)) {
    if (groupSelections[name]?.status === 'idle') groupSelections[name].selected = true
  }
}

const relevantGroups = computed(() => {
  return onlyCodeGroups.value.filter((g) =>
    g.capabilities?.some((cap) => selectedCapabilities.value.includes(cap)),
  )
})

const capabilityLabels: Record<CapabilityType, string> = { CHAT: '对话', IMAGE: '图片', VIDEO: '视频' }
function groupCapabilityLabels(group: OnlyCodeGroupInfo) {
  return group.capabilities.filter((capability) => selectedCapabilities.value.includes(capability)).map((capability) => capabilityLabels[capability]).join(' · ')
}

const hasPendingBatchItems = computed(() => {
  return relevantGroups.value.some((g) => {
    const state = groupSelections[g.name]
    return state?.selected && (state.status === 'idle' || state.status === 'error')
  })
})

const pendingBatchCount = computed(() => {
  return relevantGroups.value.filter((g) => {
    const state = groupSelections[g.name]
    return state?.selected && (state.status === 'idle' || state.status === 'error')
  }).length
})

async function createSingleGroup(groupName: string) {
  const state = groupSelections[groupName]
  if (!state || state.status === 'success') return
  state.status = 'provisioning'
  state.errorMessage = undefined
  try {
    if (!props.previewMode) {
      await api('/users/me/api-credentials/only-code', {
        method: 'POST',
        body: JSON.stringify({
          group: groupName,
          name: state.keyName.trim() || undefined,
        }),
      })
    }
    state.status = 'success'
    state.selected = false
    if (!props.previewMode) {
      emit('refresh-credentials')
      document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
    }
  } catch (error) {
    state.status = 'error'
    state.errorMessage = error instanceof Error ? error.message : '创建失败'
  }
}

async function runBatchProvision() {
  if (batchBusy.value) return
  batchBusy.value = true
  const targets = relevantGroups.value.filter((g) => {
    const state = groupSelections[g.name]
    return state?.selected && (state.status === 'idle' || state.status === 'error')
  })

  let anySuccess = false
  for (const group of targets) {
    const state = groupSelections[group.name]
    if (!state) continue
    state.status = 'provisioning'
    try {
      if (!props.previewMode) {
        await api('/users/me/api-credentials/only-code', {
          method: 'POST',
          body: JSON.stringify({
            group: group.name,
            name: state.keyName.trim() || undefined,
          }),
        })
      }
      state.status = 'success'
      state.selected = false
      anySuccess = true
    } catch (error) {
      state.status = 'error'
      state.errorMessage = error instanceof Error ? error.message : '创建失败'
    }
  }

  if (anySuccess && !props.previewMode) {
    emit('refresh-credentials')
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  }
  batchBusy.value = false
}

// 第四步入口与完成操作
const availableEntrances = computed(() => {
  if (selectedExperience.value === 'EXPERIENCED') {
    return [
      {
        title: '智能对话',
        description: '多轮对话与知识库交互',
        icon: MessageSquare,
        path: '/chat',
      },
      {
        title: '图片创作',
        description: '文生图与图生图工作流',
        icon: ImageIcon,
        path: '/image',
      },
      {
        title: '视频生成',
        description: '生成与管理短视频镜头',
        icon: VideoIcon,
        path: '/video',
      },
      {
        title: '创意画布',
        description: '自由节点与流程编辑',
        icon: LayoutGrid,
        path: '/canvases',
      },
    ]
  }

  const entries: Array<{
    title: string
    description: string
    icon: typeof MessageSquare
    path: string
  }> = []

  if (selectedCapabilities.value.includes('CHAT')) {
    entries.push({
      title: '智能对话',
      description: '多轮对话与知识库交互',
      icon: MessageSquare,
      path: '/chat',
    })
  }
  if (selectedCapabilities.value.includes('IMAGE')) {
    entries.push({
      title: '图片创作',
      description: '文生图与图生图工作流',
      icon: ImageIcon,
      path: '/image',
    })
  }
  if (selectedCapabilities.value.includes('VIDEO')) {
    entries.push({
      title: '视频生成',
      description: '生成与管理短视频镜头',
      icon: VideoIcon,
      path: '/video',
    })
  }
  entries.push({
    title: '创意画布',
    description: '节点式多模态流程编辑',
    icon: LayoutGrid,
    path: '/canvases',
  })

  return entries
})

const completing = ref(false)

async function completeAndNavigate(targetPath: string) {
  if (completing.value) return
  completing.value = true
  try {
    const payload: UpdateOnboardingDto = {
      experience: selectedExperience.value,
      capabilities: selectedExperience.value === 'EXPERIENCED' ? ['CHAT', 'IMAGE', 'VIDEO'] : selectedCapabilities.value,
      complete: true,
    }
    if (!props.previewMode) {
      await api('/users/me/onboarding', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
    }
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
    emit('completed')
    if (targetPath) {
      await router.push(targetPath).catch(() => undefined)
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '完成引导配置失败，请重试')
  } finally {
    completing.value = false
  }
}

async function exitPreview() {
  emit('completed')
  const query = { ...router.currentRoute.value.query }
  delete query.onboarding
  await router.replace({ query }).catch(() => undefined)
}
</script>
