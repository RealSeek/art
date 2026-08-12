<template>
  <div class="legal-page">
    <header class="legal-header">
      <RouterLink class="legal-brand" to="/" aria-label="Xinyue AI 首页"><span>X</span><strong>Xinyue AI</strong></RouterLink>
      <nav aria-label="公开信息导航">
        <RouterLink v-for="item in pages" :key="item.name" :to="item.path" :class="{ 'is-active': page.key === item.name }">{{ item.label }}</RouterLink>
      </nav>
      <RouterLink class="legal-workspace-link" to="/chat">进入工作台<ArrowRight :size="16" /></RouterLink>
    </header>

    <main class="legal-main">
      <aside class="legal-aside">
        <RouterLink class="legal-back" to="/"><ArrowLeft :size="15" />返回首页</RouterLink>
        <nav aria-label="本文目录">
          <a v-for="section in page.sections" :key="section.id" :href="`#${section.id}`">{{ section.title }}</a>
        </nav>
      </aside>

      <article class="legal-document">
        <header>
          <span>{{ page.eyebrow }}</span>
          <h1>{{ page.title }}</h1>
          <p>{{ page.summary }}</p>
          <time datetime="2026-08-07">生效日期：2026 年 8 月 7 日</time>
        </header>

        <section v-for="(section, index) in page.sections" :id="section.id" :key="section.id">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h2>{{ section.title }}</h2>
            <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
            <ul v-if="section.items?.length">
              <li v-for="item in section.items" :key="item">{{ item }}</li>
            </ul>
          </div>
        </section>
      </article>
    </main>

    <footer class="legal-footer">
      <span>© 2026 Xinyue AI. 保留所有权利。</span>
      <nav><RouterLink to="/about">关于我们</RouterLink><RouterLink to="/copyright">版权说明</RouterLink><RouterLink to="/terms">用户协议</RouterLink><RouterLink to="/privacy">隐私政策</RouterLink></nav>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight } from 'lucide-vue-next'

type Section = { id: string; title: string; paragraphs: string[]; items?: string[] }
type PageContent = { key: string; eyebrow: string; title: string; summary: string; sections: Section[] }

const pages = [
  { name: 'about', label: '关于我们', path: '/about' },
  { name: 'copyright', label: '版权说明', path: '/copyright' },
  { name: 'terms', label: '用户协议', path: '/terms' },
  { name: 'privacy', label: '隐私政策', path: '/privacy' },
]

const content: Record<string, PageContent> = {
  about: {
    key: 'about', eyebrow: 'ABOUT XINYUE AI', title: '关于我们',
    summary: 'Xinyue AI 是面向对话、图像创作和商业内容生产的一体化 AI 工作台。我们希望复杂能力保持强大，同时让日常使用足够直接。',
    sections: [
      { id: 'product', title: '我们的产品', paragraphs: ['Xinyue AI 将对话、图片生成、商品视觉、项目资料和 API 使用集中在同一个工作空间。用户可以在持续的上下文中组织任务、保留版本并管理生成资产。'] },
      { id: 'principles', title: '产品原则', paragraphs: ['我们围绕可控、透明和实用三个原则设计产品。模型、费用、数据设置和任务状态应当对用户清晰可见。'], items: ['让常用操作直接、稳定并可恢复。', '让模型能力、计费规则和数据边界保持透明。', '为个人用户和团队提供一致的资产管理体验。'] },
      { id: 'responsibility', title: '负责任地使用 AI', paragraphs: ['生成式 AI 可能产生不准确、遗漏或不适当的内容。对于医疗、法律、金融、安全以及其他高影响场景，用户应当进行独立核验，并由具备相应资质的人员作出最终判断。'] },
      { id: 'contact', title: '联系我们', paragraphs: ['业务合作、权利通知、隐私请求或产品支持，请通过站点管理方公布或在管理后台配置的官方客服渠道联系。我们会根据请求类型完成身份核验并进行处理。'] },
    ],
  },
  copyright: {
    key: 'copyright', eyebrow: 'COPYRIGHT NOTICE', title: '版权说明',
    summary: '本说明用于明确 Xinyue AI 自有内容、第三方软件以及用户和 AI 生成内容之间的权利边界。',
    sections: [
      { id: 'brand', title: '品牌与平台内容', paragraphs: ['Xinyue AI 的名称、标识、品牌视觉、产品文案、自有界面素材和原创代码受适用的知识产权法律保护。未经书面授权，不得冒用品牌、误导性仿制或将相关材料用于未经许可的商业用途。'] },
      { id: 'third-party', title: '第三方开源软件', paragraphs: ['本产品可能使用开源软件和第三方组件。相关组件的著作权归各自权利人所有，并继续适用其原始许可证、NOTICE 文件和署名要求。Xinyue AI 对平台整体的版权声明不会替代或限制这些第三方许可。'], items: ['依赖软件按其 MIT、Apache-2.0、BSD 或其他适用许可证提供。', '二次分发时应保留对应许可证文本和法定署名。', '第三方商标仅用于兼容性或来源说明，不代表其对本产品的背书。'] },
      { id: 'generated', title: '用户与生成内容', paragraphs: ['用户保留其合法上传内容中的既有权利。AI 生成内容能否取得或转让著作权，取决于用户输入、人工创作贡献、所用模型服务条款及适用法律。用户应确保输入、参考图片和最终用途不侵犯第三方权利。'] },
      { id: 'notice', title: '权利通知', paragraphs: ['如你认为平台中的内容侵犯了合法权利，请通过官方客服渠道提交权利证明、具体内容位置、联系方式和处理请求。信息完整后，我们将依照适用法律和平台规则进行核查。'] },
    ],
  },
  terms: {
    key: 'terms', eyebrow: 'TERMS OF SERVICE', title: '用户协议',
    summary: '使用 Xinyue AI 即表示你同意本协议。请在注册、购买套餐或提交内容前仔细阅读。',
    sections: [
      { id: 'account', title: '账户与访问', paragraphs: ['你应提供真实、有效的登录信息，并妥善保护验证码、密码、API 密钥和会话。账户下发生的操作原则上视为账户持有人的操作；发现异常访问时应立即停止使用相关凭据并联系支持。'] },
      { id: 'service', title: '服务与模型', paragraphs: ['平台可能通过自营或第三方模型渠道提供服务。模型可用性、速度和输出会受到供应商、网络、额度及安全策略影响。平台可以基于稳定性和合规要求调整模型路由、限制或功能，但会尽量保留用户可见的任务状态和资产。'] },
      { id: 'billing', title: '套餐、创作点与退款', paragraphs: ['套餐、试用、创作点和模型价格以购买页面或管理方公布的即时信息为准。不同模型可能采用不同计费单位。已消耗的服务通常不支持退款；法律另有规定、重复扣费或平台确认的服务故障除外。'] },
      { id: 'conduct', title: '可接受使用', paragraphs: ['你不得利用服务从事违法活动、侵犯他人权利、绕过访问控制、干扰服务、批量滥用试用资源，或生成和传播适用法律禁止的内容。'], items: ['不得上传无权处理的个人信息、商业秘密或受保护内容。', '不得探测、攻击、反向利用平台基础设施或他人账户。', '不得通过自动化方式规避配额、风控、计费或内容安全措施。'] },
      { id: 'liability', title: '输出核验与责任限制', paragraphs: ['AI 输出仅供辅助，不构成专业意见或事实保证。你负责审查输出并决定是否发布或用于业务。平台将在法律允许范围内提供服务，并对不可合理控制的第三方中断、网络故障和用户误用不承担超出法定范围的责任。'] },
      { id: 'changes', title: '变更与终止', paragraphs: ['我们可能因产品、法律或安全要求更新本协议，并在生效前以合理方式提示。严重违反协议、存在安全风险或法律要求时，平台可以限制或终止访问。用户可依照数据控制功能删除内容或申请注销账户。'] },
    ],
  },
  privacy: {
    key: 'privacy', eyebrow: 'PRIVACY POLICY', title: '隐私政策',
    summary: '我们只处理提供和保护服务所必需的数据，并为历史记录、模型训练偏好和分析数据提供可管理的设置。',
    sections: [
      { id: 'collection', title: '我们处理的数据', paragraphs: ['根据你使用的功能，我们可能处理账户信息、登录验证记录、对话和提示词、上传文件、生成资产、模型与计费记录、设备和基础日志，以及你主动填写的个性化设置。'], items: ['账户数据：邮箱、显示名称、用户分组和账户状态。', '内容数据：提示词、对话、附件、项目和生成结果。', '运行数据：请求时间、模型、用量、错误、安全事件和必要的设备信息。', '支付数据：订单、金额和状态；完整支付凭据通常由支付服务商处理。'] },
      { id: 'purpose', title: '处理目的', paragraphs: ['我们使用这些数据来交付模型服务、同步历史和资产、计算费用、发送账户通知、排查故障、防止滥用并履行法律义务。仅在取得相应授权或具备其他合法基础时，数据才会用于产品分析或模型改进。'] },
      { id: 'sharing', title: '共享与委托处理', paragraphs: ['为完成请求，必要内容可能发送给用户选择的模型提供商、对象存储、邮件、支付或基础设施服务商。我们要求服务商仅按约定目的处理数据。使用自有 API 密钥时，相应第三方还会依据其自身条款处理请求。'] },
      { id: 'retention', title: '保存与删除', paragraphs: ['数据保存期限取决于账户设置、服务需要和法定义务。普通聊天按历史设置保存；临时聊天按照管理方配置的较短保留周期清理。账务、安全和合规记录可能在账户内容删除后继续保留法定期限。'] },
      { id: 'controls', title: '你的控制权', paragraphs: ['你可以在设置中管理聊天历史、训练退出、使用分析、个性化和 API 凭据，并可以删除部分内容、导出对话或申请注销账户。对于访问、更正、删除或撤回同意等请求，可通过官方客服渠道提交。'] },
      { id: 'security', title: '安全与未成年人', paragraphs: ['我们采用访问控制、凭据加密、审计和最小权限等措施保护数据，但任何系统都无法保证绝对安全。服务不面向未达到所在地区法定数字服务年龄的儿童；监护人发现未成年人未经授权提供信息时可联系我们处理。'] },
    ],
  },
}

const route = useRoute()
const page = computed(() => content[String(route.name)] || content.about)
</script>
