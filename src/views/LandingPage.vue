<template>
  <div class="landing-page">
    <a class="landing-skip" href="#main-content">跳到主要内容</a>

    <header class="landing-header" :class="{ 'is-scrolled': headerScrolled }">
      <RouterLink class="landing-brand" to="/" aria-label="OnlyArt 首页">
        <span class="landing-brand__mark">O</span>
        <strong>OnlyArt</strong>
      </RouterLink>

      <nav class="landing-nav" aria-label="主要导航">
        <a href="#features">能力</a>
        <div v-for="group in navGroups" :key="group.key" class="landing-nav-menu">
          <button type="button" :aria-expanded="openNavMenu === group.key" @click.stop="toggleNavMenu(group.key)">
            {{ group.label }} <ChevronDown :size="14" />
          </button>
          <div v-if="openNavMenu === group.key" class="landing-nav-panel">
            <RouterLink v-for="item in group.items" :key="item.label" :to="item.to" @click="openNavMenu = null">
              <strong>{{ item.label }}</strong>
              <span>{{ item.description }}</span>
            </RouterLink>
          </div>
        </div>
        <RouterLink to="/chat?settings=api">配置密钥</RouterLink>
      </nav>

      <div class="landing-header__actions">
        <RouterLink class="landing-header__login" to="/login?redirect=/chat">登录</RouterLink>
        <RouterLink class="landing-header__start" to="/chat">开始使用</RouterLink>
      </div>

      <button class="landing-mobile-toggle" type="button" :aria-label="mobileMenuOpen ? '关闭导航' : '打开导航'" @click="mobileMenuOpen = !mobileMenuOpen">
        <X v-if="mobileMenuOpen" :size="22" />
        <Menu v-else :size="22" />
      </button>
    </header>

    <div v-if="mobileMenuOpen" class="landing-mobile-menu">
      <a href="#features" @click="mobileMenuOpen = false">能力</a>
      <details v-for="group in navGroups" :key="group.key">
        <summary>{{ group.label }} <ChevronDown :size="17" /></summary>
        <div>
          <RouterLink v-for="item in group.items" :key="item.label" :to="item.to" @click="mobileMenuOpen = false">
            {{ item.label }} <ArrowUpRight :size="16" />
          </RouterLink>
        </div>
      </details>
      <RouterLink to="/chat?settings=api" @click="mobileMenuOpen = false">配置密钥</RouterLink>
      <RouterLink class="landing-mobile-menu__login" to="/login?redirect=/chat" @click="mobileMenuOpen = false">登录</RouterLink>
    </div>

    <main id="main-content" tabindex="-1">
      <section id="intro" class="landing-hero">
        <div class="landing-hero__copy">
          <p class="landing-eyebrow"><Sparkles :size="14" /> 与 OnlyCode 共用账号与密钥</p>
          <h1>灵感不再断层，<span>从对话推演到整套创作交付</span></h1>
          <p class="landing-hero__lead">一个工作台串起 AI 对话、图片、视频、画布与电商成套视觉。需求、参考和成品都留在同一个项目里，随时接着往下做。</p>
          <div class="landing-hero__actions">
            <RouterLink class="landing-cta landing-cta--primary" to="/login?redirect=/chat">使用 OnlyCode 登录 <ArrowRight :size="16" /></RouterLink>
            <a class="landing-cta landing-cta--ghost" href="#features">查看平台能力</a>
          </div>
          <ul class="landing-hero__meta">
            <li>多模型统一调度</li>
            <li>作品自动归档</li>
            <li>按量使用自己的密钥</li>
          </ul>
        </div>

        <div class="landing-stage" aria-hidden="true">
          <div class="landing-stage__window">
            <div class="landing-stage__bar"><i></i><i></i><i></i><span>OnlyArt · 春季新品项目</span></div>
            <div class="landing-stage__body">
              <div class="landing-stage__side">
                <span class="landing-stage__logo"><b>O</b>OnlyArt</span>
                <span v-for="(item, index) in previewNav" :key="item" class="landing-stage__pill" :class="{ 'is-active': index === 1 }"><i></i>{{ item }}</span>
              </div>
              <div class="landing-stage__canvas">
                <img class="landing-stage__image" src="/assets/image-studio-white.jpg" alt="" />
                <div class="landing-stage__prompt"><Sparkles :size="14" /><span>为新品耳机生成一套暖色调上新主图</span><b>生成</b></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" class="landing-section" aria-labelledby="landing-features-title">
        <div class="landing-section-head">
          <p class="landing-eyebrow">平台能力</p>
          <h2 id="landing-features-title">一个入口，覆盖从想法到交付的每一步</h2>
        </div>
        <div class="landing-features">
          <RouterLink v-for="feature in features" :key="feature.title" class="landing-feature" :to="feature.to">
            <span class="landing-feature__icon"><component :is="feature.icon" :size="20" /></span>
            <strong>{{ feature.title }}</strong>
            <span>{{ feature.description }}</span>
          </RouterLink>
        </div>
      </section>

      <section id="capabilities" class="landing-section" aria-labelledby="landing-showcase-title">
        <div class="landing-section-head">
          <p class="landing-eyebrow">工作流</p>
          <h2 id="landing-showcase-title">{{ showcaseTitle }}</h2>
        </div>
        <div class="landing-showcase">
          <div class="landing-showcase__modes">
            <button v-for="(mode, index) in showcaseModes" :key="mode.key" type="button" :class="{ 'is-active': activeMode === index }" :aria-pressed="activeMode === index" @click="activeMode = index">
              <strong>{{ mode.title }}</strong>
              <span>{{ mode.lead }}</span>
            </button>
          </div>
          <div class="landing-showcase__panel">
            <div class="landing-showcase__copy">
              <h3>{{ currentMode.lead }}</h3>
              <p>{{ currentMode.description }}</p>
              <div class="landing-showcase__actions">
                <RouterLink v-for="action in currentMode.actions" :key="action.label" :to="action.to">{{ action.label }} <ArrowRight :size="15" /></RouterLink>
              </div>
            </div>
            <figure class="landing-showcase__shot">
              <img :src="currentMode.image" :alt="currentMode.imageAlt" loading="lazy" decoding="async" />
            </figure>
          </div>
        </div>
      </section>

      <section class="landing-section landing-trust" aria-labelledby="landing-trust-title">
        <div class="landing-section-head">
          <p class="landing-eyebrow">可靠交付</p>
          <h2 id="landing-trust-title">{{ landing.trustTitle }}</h2>
          <p>{{ landing.trustDescription }}</p>
        </div>
        <div class="landing-trust__grid">
          <article v-for="item in landing.trustItems" :key="item.title"><ShieldCheck :size="18" /><h3>{{ item.title }}</h3><p>{{ item.description }}</p></article>
        </div>
      </section>

      <section class="landing-section" aria-labelledby="landing-links-title">
        <div class="landing-section-head">
          <p class="landing-eyebrow">下一步</p>
          <h2 id="landing-links-title">{{ landing.linksTitle }}</h2>
          <p>{{ landing.linksDescription }}</p>
        </div>
        <div class="landing-links">
          <RouterLink v-for="item in capabilityLinks" :key="item.title" :to="item.to">
            <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span><ArrowUpRight :size="18" />
          </RouterLink>
        </div>
      </section>

      <section class="landing-section landing-faq" aria-labelledby="landing-faq-title">
        <div class="landing-section-head">
          <p class="landing-eyebrow">常见问题</p>
          <h2 id="landing-faq-title">{{ landing.faqTitle }}</h2>
        </div>
        <div class="landing-faq__list">
          <details v-for="item in faqs" :key="item.question">
            <summary>{{ item.question }}<ChevronDown :size="18" /></summary>
            <p>{{ item.answer }}</p>
          </details>
        </div>
      </section>

      <section id="start" class="landing-final">
        <h2>{{ landing.finalTitle }}</h2>
        <p>{{ landing.finalDescription }}</p>
        <div class="landing-hero__actions">
          <RouterLink class="landing-cta landing-cta--primary" to="/chat">开始使用 <ArrowRight :size="16" /></RouterLink>
          <RouterLink class="landing-cta landing-cta--ghost" to="/chat?settings=api">配置密钥</RouterLink>
        </div>
      </section>
    </main>

    <footer class="landing-footer">
      <div class="landing-footer__brand">
        <strong><span class="landing-brand__mark">O</span> OnlyArt</strong>
        <p>{{ landing.footerDescription }}</p>
      </div>
      <div class="landing-footer__groups">
        <section><h2>产品</h2><RouterLink to="/chat">AI 对话</RouterLink><RouterLink to="/image">图片生成</RouterLink><RouterLink to="/commerce">商品素材包</RouterLink><RouterLink to="/commerce">商品详情页</RouterLink></section>
        <section><h2>模型</h2><a href="#capabilities">GPT-5.5</a><a href="#capabilities">GPT Image 2</a><a href="#capabilities">Flux Vision</a></section>
        <section><h2>了解我们</h2><RouterLink to="/about">关于我们</RouterLink><RouterLink to="/copyright">版权说明</RouterLink></section>
        <section><h2>条款与政策</h2><RouterLink to="/terms">用户协议</RouterLink><RouterLink to="/privacy">隐私政策</RouterLink></section>
      </div>
      <p class="landing-footer__copyright">{{ landing.copyright }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { ArrowRight, ArrowUpRight, ChevronDown, Clapperboard, Images, LibraryBig, Menu, MessageSquareText, ShieldCheck, ShoppingBag, Sparkles, Workflow, X } from 'lucide-vue-next'
import { useCatalogStore, type LandingContent } from '../stores/catalog'

const activeMode = ref(0)
const openNavMenu = ref<string | null>(null)
const mobileMenuOpen = ref(false)
const headerScrolled = ref(false)

const features: Array<{ title: string; description: string; to: string; icon: Component }> = [
  { title: 'AI 对话', description: '梳理需求、整理资料、撰写文案，项目上下文持续保留。', to: '/chat', icon: MessageSquareText },
  { title: '图片创作', description: '文生图、参考图编辑、局部重绘与多张候选并行生成。', to: '/image', icon: Images },
  { title: '视频创作', description: '从脚本或参考图生成短片，镜头与时长参数集中调整。', to: '/video', icon: Clapperboard },
  { title: '无限画布', description: '把对话、图片和视频节点连成可复用的创作流程。', to: '/canvases', icon: Workflow },
  { title: '电商中心', description: '商品素材包与连续详情页，按用途成套规划与交付。', to: '/commerce', icon: ShoppingBag },
  { title: '提示词库', description: '沉淀好用的提示词与风格，随取随用不必重写。', to: '/prompts', icon: LibraryBig },
]

const defaultModes = [
  {
    key: 'chat', title: '对话', path: 'chat', image: '/assets/chat-workspace-white.jpg', imageAlt: 'OnlyArt 对话工作台预览',
    lead: '先聊清需求、资料和下一步。',
    description: '讨论方案、整理文件、撰写内容或分析图片。项目上下文会保留在同一段工作中，不必每次重新交代背景。',
    actions: [{ label: '开始对话', to: '/chat' }],
  },
  {
    key: 'image', title: '图片创作', path: 'image', image: '/assets/image-studio-white.jpg', imageAlt: 'OnlyArt 图片创作工作台预览',
    lead: '从描述或参考图开始创作。',
    description: '选择模型、比例和输出数量，生成多张候选并继续编辑，结果自动进入文件库。',
    actions: [{ label: '开始创作', to: '/image' }],
  },
  {
    key: 'product', title: '商品上新', path: 'commerce', image: '/assets/product-visual-white.jpg', imageAlt: 'OnlyArt 商品视觉工作台预览',
    lead: '从商品资料到成套上新视觉。',
    description: '商品素材包和连续详情页分别规划、分别交付。系统会根据用途规划独立商品图片或连续中文页面，结果统一进入文件库。',
    actions: [{ label: '制作素材包', to: '/commerce' }, { label: '制作详情页', to: '/commerce' }],
  },
]

const defaultNavGroups = [
  { key: 'features', label: '功能', items: [
    { label: 'AI 对话', description: '思考、写作与协作', to: '/chat' },
    { label: '图片生成', description: '生成、编辑与多图创作', to: '/image' },
    { label: '商品素材包', description: '按用途规划一组商品图片', to: '/commerce' },
    { label: '商品详情页', description: '按顺序阅读的连续商品页面', to: '/commerce' },
  ] },
  { key: 'models', label: '模型', items: [
    { label: 'GPT-5.5', description: '复杂任务与深度思考', to: '/chat' },
    { label: 'GPT Image 2', description: '高质量图片生成与编辑', to: '/image' },
    { label: 'Flux Vision', description: '快速视觉探索与多图创作', to: '/image' },
  ] },
]

const defaultPreviewNav = ['新对话', '图片生成', '电商中心', '项目', '文件库', 'API']

const defaultCapabilityLinks = [
  { title: '图片生成', description: '了解普通图片生成、参考图编辑与多张候选。', to: '/image' },
  { title: '商品素材包', description: '围绕同一商品生成一组各有用途的商品图片。', to: '/commerce' },
  { title: '商品详情页', description: '生成需要按顺序阅读的连续商品介绍。', to: '/commerce' },
  { title: 'OnlyCode 密钥', description: '配置自己的 API 密钥后使用模型能力。', to: '/chat?settings=api' },
]
const defaultFaqs = [
  { question: '一定要先从 AI 对话开始吗？', answer: '不需要。需求明确时可以直接进入图片创作或商品中心；需要梳理背景、资料和交付标准时，再从对话开始。' },
  { question: '图片生成、商品素材包和商品详情页有什么区别？', answer: '图片生成处理单次视觉任务；商品素材包围绕同一商品规划多张独立用途图片；商品详情页则是按顺序阅读的连续页面。' },
  { question: '商品素材包和商品详情页必须一起生成吗？', answer: '不必。它们是独立任务，可以分别创建、修改和下载。' },
  { question: '只有一张商品图，也可以制作素材包或详情页吗？', answer: '可以。系统会以你提供的商品图和事实信息为基础规划内容，并明确标识还需要补充的资料。' },
  { question: '项目和普通对话有什么区别？', answer: '项目会长期保存对话、文件、生成记录与版本，适合持续性的品牌或商品工作。' },
  { question: '生成的作品保存在哪里？', answer: '所有生成结果都会进入文件库，并可关联到当前项目继续编辑和下载。' },
  { question: '使用前需要准备什么？', answer: '使用 OnlyCode 账号登录，并在设置中配置自己创建的 API 密钥即可。' },
]

const catalog = useCatalogStore()
const fallbackLanding: LandingContent = {
  heroLead: '在一个平台，完成', modes: defaultModes, navGroups: defaultNavGroups, previewNav: defaultPreviewNav,
  trustTitle: '创作可以大胆，关键信息不能靠猜。', trustDescription: 'OnlyArt 会利用当前对话和你提供的资料继续工作；涉及事实信息时，只使用有依据的内容。',
  trustItems: [{ title: '上下文持续可用，作品统一留存', description: '项目里的对话、文件和生成结果会统一保留，可从明确版本继续处理。' }, { title: '有依据的信息，才写进商业内容', description: '没有可靠依据的内容，不会被包装成商品事实。' }],
  linksTitle: '把当前任务，接到合适的下一步。', linksDescription: '根据现在要完成的内容，继续了解相关能力和使用方式。', capabilityLinks: defaultCapabilityLinks,
  faqTitle: '开始前，你可能还想确认这些。', faqs: defaultFaqs,
  finalTitle: '从今天要完成的事开始。', finalDescription: '提出一个问题、生成素材或发起办公任务，选择当前任务就可以开始。', footerDescription: '在同一个平台完成 AI 对话、视觉创作、办公任务和团队协作。', copyright: '© 2026 OnlyArt. 保留所有权利。',
}
const landing = computed<LandingContent>(() => ({ ...fallbackLanding, ...(catalog.settings.siteContent.landing || {}) }))
const showcaseModes = computed(() => landing.value.modes.length >= 3 ? landing.value.modes : defaultModes)
const navGroups = computed(() => landing.value.navGroups.length ? landing.value.navGroups : defaultNavGroups)
const previewNav = computed(() => landing.value.previewNav.length ? landing.value.previewNav : defaultPreviewNav)
const capabilityLinks = computed(() => landing.value.capabilityLinks.length ? landing.value.capabilityLinks : defaultCapabilityLinks)
const faqs = computed(() => landing.value.faqs.length ? landing.value.faqs : defaultFaqs)
// 展示区标题沿用后台可配置的 heroLead，并拼接各模式名称。
const showcaseTitle = computed(() => `${landing.value.heroLead}${showcaseModes.value.map((mode) => mode.title).join('、')}`)
const currentMode = computed(() => showcaseModes.value[activeMode.value] ?? showcaseModes.value[0])

function toggleNavMenu(key: string) {
  openNavMenu.value = openNavMenu.value === key ? null : key
}

function updateHeaderScrolled() {
  headerScrolled.value = window.scrollY > 8
}

function closeNavOnOutside(event: PointerEvent) {
  if (!(event.target as Element | null)?.closest('.landing-nav-menu')) openNavMenu.value = null
}

function closeNavOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') openNavMenu.value = null
}

watch(mobileMenuOpen, (open) => {
  document.documentElement.classList.toggle('landing-menu-open', open)
})

onMounted(() => {
  void catalog.load()
  window.addEventListener('scroll', updateHeaderScrolled, { passive: true })
  document.addEventListener('pointerdown', closeNavOnOutside)
  document.addEventListener('keydown', closeNavOnEscape)
  updateHeaderScrolled()
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateHeaderScrolled)
  document.removeEventListener('pointerdown', closeNavOnOutside)
  document.removeEventListener('keydown', closeNavOnEscape)
  document.documentElement.classList.remove('landing-menu-open')
})
</script>
