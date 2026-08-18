<template>
  <div class="settings-page">
    <header class="page-title"
      ><div
        ><h1>{{ xt('业务系统配置') }}</h1
        ><p>{{ xt('统一管理站点、登录注册、商业化、邮件服务和用户默认值') }}</p></div
      ><ElButton type="primary" :loading="saving" :disabled="!settings" @click="save"
        ><ArtSvgIcon icon="ri:save-line" />{{ xt('保存配置') }}</ElButton
      ></header
    >
    <ElTabs v-model="tab" class="settings-tabs">
      <ElTabPane :label="xt('站点与商业能力')" name="site"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('站点信息') }}</strong></template
          ><ElForm label-position="top"
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('站点名称')"
                  ><ElInput v-model.trim="settings.siteName" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('客服地址')"
                  ><ElInput
                    v-model.trim="settings.supportUrl"
                    placeholder="https://..." /></ElFormItem></ElCol></ElRow
            ><ElFormItem :label="xt('品牌 Logo 地址')"
              ><ElInput
                v-model.trim="settings.siteLogoUrl"
                :placeholder="xt('留空使用默认品牌标识')" /></ElFormItem></ElForm></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header><strong>{{ xt('用户端导航') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow v-model="settings.sidebarCreationEnabled" :title="xt('AI 创作')" :note="xt('图片与视频创作入口')" />
            <ToggleRow v-model="settings.sidebarCommerceEnabled" :title="xt('电商中心')" :note="xt('商品视觉与电商内容入口')" />
            <ToggleRow v-model="settings.sidebarOfficeEnabled" :title="xt('办公中心')" :note="xt('文档、表格和 Agent 任务入口')" />
            <ToggleRow v-model="settings.sidebarPromptsEnabled" :title="xt('提示词库')" :note="xt('图片和视频灵感入口')" />
            <ToggleRow v-model="settings.sidebarPluginsEnabled" :title="xt('能力中心')" :note="xt('助手、技能、工具和知识库入口')" />
            <ToggleRow v-model="workspaceSidebarEnabled" :title="xt('工作空间')" :note="xt('统一管理项目、工作流、版本与文件资产')" /></div></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('商业能力开关') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.subscriptionsEnabled"
              :title="xt('开放订阅套餐')"
              :note="xt('用户端展示套餐购买与订阅权益')" /><ToggleRow
              v-model="settings.trialEnabled"
              :title="xt('开放免费试用')"
              :note="xt('允许符合条件的新用户领取试用')" /><ToggleRow
              v-model="settings.rechargeEnabled"
              :title="xt('开放余额充值')"
              :note="xt('用户端展示充值商品和支付入口')" /><ToggleRow
              v-model="settings.userByokEnabled"
              :title="xt('允许用户 API 密钥')"
              :note="xt('最终权限仍受用户分组和模型配置约束')" /></div
          ><ElRow :gutter="16" class="number-row"
            ><ElCol :span="8"
              ><ElFormItem :label="xt('最低充值金额（分）')"
                ><ElInputNumber
                  v-model="settings.minRechargeCents"
                  :min="1"
                  class="wide" /></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('结算币种')"
                ><ElSelect v-model="settings.currency" class="wide"
                  ><ElOption :label="xt('人民币 CNY')" value="CNY" /><ElOption
                    :label="xt('美元 USD')"
                    value="USD" /></ElSelect></ElFormItem></ElCol
            ><ElCol :span="8"
              ><ElFormItem :label="xt('每点价值（微元）')"
                ><ElInputNumber
                  v-model="settings.creditValueMicros"
                  :min="0"
                  class="wide" /></ElFormItem></ElCol></ElRow
          ><ElDivider content-position="left">{{ xt('模型自动定价') }}</ElDivider
          ><ElRow :gutter="16" class="number-row"
            ><ElCol :span="8"><ElFormItem :label="xt('默认售价加价率（%）')"><ElInputNumber v-model="settings.modelImportMarkupPercent" :min="100" :max="1000" class="wide" /></ElFormItem></ElCol
            ><ElCol :span="8"><ElFormItem :label="xt('价格目录刷新（小时）')"><ElInputNumber v-model="settings.modelPriceCatalogRefreshHours" :min="1" :max="168" class="wide" /></ElFormItem></ElCol
            ><ElCol :span="8"><ElFormItem :label="xt('价格目录')"><ElInput v-model.trim="settings.modelPriceCatalogUrl" class="wide" /></ElFormItem></ElCol></ElRow
          ><ElAlert :title="xt('自动导入仅为新模型设置默认售价；重新同步不会覆盖人工修改的价格。')" type="info" :closable="false" show-icon /></ElCard
      ></ElTabPane>

      <ElTabPane :label="xt('后台安全')" name="security">
        <ElCard shadow="never"><template #header><div class="card-title"><strong>{{ xt('管理员多因素认证') }}</strong><ElTag :type="mfaStatus.enabled ? 'success' : 'warning'">{{ mfaStatus.enabled ? xt('已启用') : xt('未启用') }}</ElTag></div></template>
          <div class="mfa-overview"><div><ArtSvgIcon icon="ri:shield-keyhole-line" /><span><strong>{{ xt('身份验证器 TOTP') }}</strong><small v-if="mfaStatus.enabled">{{ xt('启用时间') }}：{{ formatMfaTime(mfaStatus.enabledAt) }} · {{ xt('剩余恢复码') }} {{ mfaStatus.recoveryCodesRemaining }}</small><small v-else>{{ xt('登录管理后台时，在密码之后验证动态验证码。') }}</small></span></div><ElButton v-if="!mfaStatus.enabled" type="primary" :loading="mfaBusy" @click="beginMfaSetup">{{ xt('启用 MFA') }}</ElButton></div>
          <template v-if="mfaStatus.enabled"><ElDivider /><ElForm label-position="top" class="mfa-actions"><ElFormItem :label="xt('动态验证码或恢复码')"><ElInput v-model.trim="mfaCode" maxlength="32" autocomplete="one-time-code" :placeholder="xt('用于验证当前安全操作')" /></ElFormItem><div><ElButton type="primary" :loading="mfaBusy" @click="verifyCurrentSession">{{ xt('验证当前会话') }}</ElButton><ElButton :loading="mfaBusy" @click="regenerateRecoveryCodes">{{ xt('重新生成恢复码') }}</ElButton></div><ElDivider /><ElFormItem :label="xt('停用前确认密码')"><ElInput v-model="mfaPassword" type="password" show-password autocomplete="current-password" /></ElFormItem><ElButton type="danger" plain :loading="mfaBusy" @click="disableMfa">{{ xt('停用 MFA') }}</ElButton></ElForm></template>
        </ElCard>
      </ElTabPane>

      <ElTabPane :label="xt('登录与注册')" name="auth"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('站内账户') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.registrationEnabled"
              :title="xt('开放新用户注册')"
              :note="xt('关闭后只允许已有账户登录')" /><ToggleRow
              v-model="settings.passwordLoginEnabled"
              :title="xt('用户名 / 邮箱密码登录')"
              :note="xt('用户使用注册后的账户与密码登录')" /><ToggleRow
              v-model="settings.emailLoginEnabled"
              :title="xt('邮箱验证码登录')"
              :note="xt('通过邮箱一次性验证码登录')" /><ToggleRow
              v-model="settings.emailVerifyEnabled"
              :title="xt('注册时验证邮箱')"
              :note="xt('新账户完成邮箱验证后注册')" /><ToggleRow
              v-model="settings.passwordRegistrationEnabled"
              :title="xt('允许用户名密码注册')"
              :note="xt('可不填写邮箱，仅使用用户名和密码注册')" /></div
          ><ElForm label-position="top" class="form-block"
            ><ElFormItem :label="xt('允许注册的邮箱域名')"
              ><ElInput
                v-model="domainsText"
                type="textarea"
                :rows="3"
                :placeholder="xt('留空不限制；多个域名用逗号或换行分隔')" /></ElFormItem
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('验证码有效时间（分钟）')"
                  ><ElInputNumber
                    v-model="settings.otpTtlMinutes"
                    :min="1"
                    :max="60"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('重新发送间隔（秒）')"
                  ><ElInputNumber
                    v-model="settings.otpResendSeconds"
                    :min="10"
                    :max="3600"
                    class="wide" /></ElFormItem></ElCol></ElRow></ElForm></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><strong>Linux.do Connect</strong
              ><ElTag :type="linuxReady ? 'success' : 'info'">{{
                linuxReady ? xt('配置完整') : xt('待配置')
              }}</ElTag></div
            ></template
          ><ToggleRow
            v-model="settings.linuxDoLoginEnabled"
            :title="xt('启用 Linux.do 登录')"
            :note="xt('登录按钮展示在站内账户登录方式下方')" /><ElForm
            label-position="top"
            class="form-block"
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem label="Client ID"
                  ><ElInput v-model.trim="settings.linuxDoClientId" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem label="Client Secret"
                  ><ElInput
                    v-model="linuxSecret"
                    type="password"
                    show-password
                    :placeholder="
                      settings.hasLinuxDoClientSecret
                        ? `${xt('已保存')} ${settings.linuxDoClientSecretHint || ''}，${xt('留空保留')}`
                        : xt('请输入 Client Secret')
                    " /></ElFormItem></ElCol></ElRow
            ><ElFormItem :label="xt('回调地址')"
              ><ElInput v-model.trim="settings.linuxDoRedirectUrl"
                ><template #append
                  ><ElButton @click="fillCallback">{{ xt('本地地址') }}</ElButton></template
                ></ElInput
              ></ElFormItem
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem label="Scope"
                  ><ElInput v-model.trim="settings.linuxDoScopes" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('UserInfo 端点')"
                  ><ElInput
                    v-model.trim="settings.linuxDoUserInfoUrl" /></ElFormItem></ElCol></ElRow
            ><ElCollapse
              ><ElCollapseItem :title="xt('高级 OAuth 端点')" name="oauth"
                ><ElFormItem :label="xt('Authorize 端点')"
                  ><ElInput v-model.trim="settings.linuxDoAuthorizeUrl" /></ElFormItem
                ><ElFormItem :label="xt('Token 端点')"
                  ><ElInput
                    v-model.trim="
                      settings.linuxDoTokenUrl
                    " /></ElFormItem></ElCollapseItem></ElCollapse></ElForm></ElCard
      ></ElTabPane>

      <ElTabPane :label="xt('邮件服务')" name="email"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><strong>{{ xt('SMTP 发信服务') }}</strong
              ><ElTag :type="smtpReady ? 'success' : 'info'">{{
                smtpReady ? xt('配置完整') : xt('待配置')
              }}</ElTag></div
            ></template
          ><ToggleRow
            v-model="settings.smtpEnabled"
            :title="xt('启用 SMTP')"
            :note="xt('用于登录验证码、通知、找回和运营邮件')"
          /><ElForm label-position="top" class="form-block"
            ><ElRow :gutter="16"
              ><ElCol :span="16"
                ><ElFormItem :label="xt('SMTP 主机')"
                  ><ElInput
                    v-model.trim="settings.smtpHost"
                    placeholder="smtp.example.com" /></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('端口')"
                  ><ElInputNumber
                    v-model="settings.smtpPort"
                    :min="1"
                    :max="65535"
                    class="wide" /></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('用户名')"
                  ><ElInput v-model.trim="settings.smtpUsername" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('密码 / 授权码')"
                  ><ElInput
                    v-model="smtpPassword"
                    type="password"
                    show-password
                    :placeholder="
                      settings.hasSmtpPassword
                        ? `${xt('已保存')} ${settings.smtpPasswordHint || ''}，${xt('留空保留')}`
                        : ''
                    " /></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('发件人名称')"
                  ><ElInput v-model.trim="settings.smtpFromName" /></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('发件邮箱')"
                  ><ElInput v-model.trim="settings.smtpFromEmail" /></ElFormItem></ElCol></ElRow
            ><ElCheckbox v-model="settings.smtpSecure">{{
              xt('使用 SSL / TLS 安全连接')
            }}</ElCheckbox></ElForm
          ></ElCard
        ></ElTabPane
      >

      <ElTabPane :label="xt('新用户默认值')" name="defaults"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('账户与权益') }}</strong></template
          ><ElForm label-position="top"
            ><ElRow :gutter="16"
              ><ElCol :span="8"
                ><ElFormItem :label="xt('注册赠送创作点')"
                  ><ElInputNumber
                    v-model="settings.defaultUserCredits"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('邀请奖励')"
                  ><ElInputNumber
                    v-model="settings.inviteRewardCredits"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('试用赠送创作点')"
                  ><ElInputNumber
                    v-model="settings.trialCredits"
                    :min="0"
                    class="wide" /></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认用户分组')"
                  ><ElSelect v-model="settings.defaultUserGroupId" class="wide"
                    ><ElOption
                      v-for="group in groups"
                      :key="group.id"
                      :label="group.name"
                      :value="group.id" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认试用套餐')"
                  ><ElSelect v-model="settings.defaultTrialPlanId" clearable class="wide"
                    ><ElOption
                      v-for="plan in trialPlans"
                      :key="plan.id"
                      :label="`${plan.name} · ${plan.trialDays} ${xt('天')}`"
                      :value="plan.id" /></ElSelect></ElFormItem></ElCol></ElRow></ElForm></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header><strong>{{ xt('邀请奖励规则') }}</strong></template
          ><div class="toggle-grid"
            ><ToggleRow v-model="settings.referralEnabled" :title="xt('启用邀请奖励')" :note="xt('邀请关系在注册时绑定，首笔有效支付后进入奖励流程')" />
            <ToggleRow v-model="settings.referralAutoApprove" :title="xt('低风险自动审核')" :note="xt('同 IP、同设备等风险记录仍进入人工审核')" /></div
          ><ElForm label-position="top" class="form-block"
            ><ElRow :gutter="16" class="number-row"
              ><ElCol :xs="24" :sm="8"><ElFormItem :label="xt('首笔支付门槛（分）')"><ElInputNumber v-model="settings.referralMinimumPaidCents" :min="0" class="wide" /></ElFormItem></ElCol
              ><ElCol :xs="24" :sm="8"><ElFormItem :label="xt('奖励冷静期（天）')"><ElInputNumber v-model="settings.referralCoolingDays" :min="0" :max="365" class="wide" /></ElFormItem></ElCol
              ><ElCol :xs="24" :sm="8"><ElFormItem :label="xt('每人每月自动奖励上限（笔）')"><ElInputNumber v-model="settings.referralMonthlyRewardLimit" :min="0" class="wide" /></ElFormItem></ElCol></ElRow
          ></ElForm
          ><ElAlert :title="xt('支付退款后低于门槛时会自动冲正奖励；余额不足将转入人工审核。')" type="info" :closable="false" show-icon /></ElCard
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><strong>{{ xt('体验与隐私默认值') }}</strong></template
          ><ElForm label-position="top"
            ><ElRow :gutter="16"
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认对话模型')"
                  ><ElSelect v-model="settings.defaultChatModelKey" clearable class="wide"
                    ><ElOption
                      v-for="model in chatModels"
                      :key="model.key"
                      :label="model.displayName"
                      :value="model.key" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="12"
                ><ElFormItem :label="xt('默认图片模型')"
                  ><ElSelect v-model="settings.defaultImageModelKey" clearable class="wide"
                    ><ElOption
                      v-for="model in imageModels"
                      :key="model.key"
                      :label="model.displayName"
                      :value="model.key" /></ElSelect></ElFormItem></ElCol></ElRow
            ><ElRow :gutter="16"
              ><ElCol :span="8"
                ><ElFormItem :label="xt('默认主题')"
                  ><ElSelect v-model="settings.defaultTheme" class="wide"
                    ><ElOption :label="xt('跟随系统')" value="system" /><ElOption
                      :label="xt('浅色')"
                      value="light" /><ElOption
                      :label="xt('深色')"
                      value="dark" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('默认语言')"
                  ><ElSelect v-model="settings.defaultLanguage" class="wide"
                    ><ElOption :label="xt('简体中文')" value="zh-CN" /><ElOption
                      :label="xt('繁體中文')"
                      value="zh-TW" /><ElOption label="English" value="en" /><ElOption
                      :label="xt('日本語')"
                      value="ja" /><ElOption
                      :label="xt('한국어')"
                      value="ko" /></ElSelect></ElFormItem></ElCol
              ><ElCol :span="8"
                ><ElFormItem :label="xt('临时聊天保留（小时）')"
                  ><ElInputNumber
                    v-model="settings.temporaryChatRetentionHours"
                    :min="1"
                    :max="8760"
                    class="wide" /></ElFormItem></ElCol></ElRow></ElForm
          ><div class="toggle-grid"
            ><ToggleRow
              v-model="settings.defaultChatHistoryEnabled"
              :title="xt('默认保存聊天历史')"
              :note="xt('用户可在个人隐私设置中修改')" /><ToggleRow
              v-model="settings.defaultTrainingOptOut"
              :title="xt('默认不用于训练')"
              :note="xt('商业环境推荐保持开启')" /><ToggleRow
              v-model="settings.defaultShareUsageAnalytics"
              :title="xt('默认共享匿名统计')"
              :note="xt('建议由用户主动选择开启')" /></div></ElCard
      ></ElTabPane>

      <ElTabPane :label="xt('公开页面内容')" name="content">
        <ElCard v-if="settings" shadow="never"><template #header><div class="card-title"><div><strong>{{ xt('官网首页') }}</strong><small>{{ xt('结构化内容保存后直接由用户端读取') }}</small></div><ElButton @click="router.push('/article/article-list')"><ArtSvgIcon icon="ri:article-line" />{{ xt('法律与品牌页面') }}</ElButton></div></template>
          <ElForm label-position="top" class="public-content-form">
            <ElFormItem :label="xt('首页主标题前缀')"><ElInput v-model="settings.siteContent.landing.heroLead" maxlength="100" /></ElFormItem>
            <ElRow :gutter="16"><ElCol :span="12"><ElFormItem :label="xt('可信内容区标题')"><ElInput v-model="settings.siteContent.landing.trustTitle" /></ElFormItem></ElCol><ElCol :span="12"><ElFormItem :label="xt('能力入口区标题')"><ElInput v-model="settings.siteContent.landing.linksTitle" /></ElFormItem></ElCol></ElRow>
            <ElFormItem :label="xt('可信内容区说明')"><ElInput v-model="settings.siteContent.landing.trustDescription" type="textarea" :rows="2" maxlength="500" show-word-limit /></ElFormItem>
            <ElFormItem :label="xt('能力入口区说明')"><ElInput v-model="settings.siteContent.landing.linksDescription" type="textarea" :rows="2" maxlength="500" show-word-limit /></ElFormItem>
            <ElDivider content-position="left">{{ xt('首页任务模式') }}</ElDivider>
            <section class="site-content-list"><article v-for="(mode, index) in settings.siteContent.landing.modes" :key="mode.key"><header><strong>{{ index + 1 }}. {{ mode.title }}</strong></header><div class="site-content-fields"><ElInput v-model="mode.title" :placeholder="xt('名称')" /><ElInput v-model="mode.lead" :placeholder="xt('短标题')" /><ElInput v-model="mode.path" :placeholder="xt('路径')" /><ElInput v-model="mode.image" :placeholder="xt('预览图地址')" /><ElInput v-model="mode.description" type="textarea" :rows="2" :placeholder="xt('能力说明')" /></div></article></section>
            <ElDivider content-position="left">{{ xt('顶部导航') }}</ElDivider>
            <section class="site-content-list"><article v-for="group in settings.siteContent.landing.navGroups" :key="group.key"><header><ElInput v-model="group.label" :placeholder="xt('分组名称')" /></header><div v-for="(item, itemIndex) in group.items" :key="itemIndex" class="site-content-inline"><ElInput v-model="item.label" :placeholder="xt('名称')" /><ElInput v-model="item.description" :placeholder="xt('说明')" /><ElInput v-model="item.to" :placeholder="xt('跳转地址')" /><ElButton text type="danger" @click="group.items.splice(itemIndex, 1)"><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></div><ElButton plain @click="group.items.push({ label: '新入口', description: '', to: '/chat' })"><ArtSvgIcon icon="ri:add-line" />{{ xt('新增入口') }}</ElButton></article></section>
            <ElDivider content-position="left">{{ xt('能力入口') }}</ElDivider>
            <section class="site-content-list"><div v-for="(item, index) in settings.siteContent.landing.capabilityLinks" :key="index" class="site-content-inline"><ElInput v-model="item.title" :placeholder="xt('名称')" /><ElInput v-model="item.description" :placeholder="xt('说明')" /><ElInput v-model="item.to" :placeholder="xt('跳转地址')" /><ElButton text type="danger" @click="settings.siteContent.landing.capabilityLinks.splice(index, 1)"><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></div><ElButton plain @click="settings.siteContent.landing.capabilityLinks.push({ title: '新能力', description: '', to: '/chat' })"><ArtSvgIcon icon="ri:add-line" />{{ xt('新增能力入口') }}</ElButton></section>
            <ElDivider content-position="left">{{ xt('常见问题') }}</ElDivider>
            <ElFormItem :label="xt('区域标题')"><ElInput v-model="settings.siteContent.landing.faqTitle" /></ElFormItem><section class="site-content-list"><article v-for="(item, index) in settings.siteContent.landing.faqs" :key="index"><header><ElInput v-model="item.question" :placeholder="xt('问题')" /><ElButton text type="danger" @click="settings.siteContent.landing.faqs.splice(index, 1)"><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></header><ElInput v-model="item.answer" type="textarea" :rows="2" :placeholder="xt('答案')" maxlength="1000" show-word-limit /></article><ElButton plain @click="settings.siteContent.landing.faqs.push({ question: '新问题', answer: '' })"><ArtSvgIcon icon="ri:add-line" />{{ xt('新增问题') }}</ElButton></section>
            <ElDivider content-position="left">{{ xt('页尾与行动区') }}</ElDivider><ElRow :gutter="16"><ElCol :span="12"><ElFormItem :label="xt('行动区标题')"><ElInput v-model="settings.siteContent.landing.finalTitle" /></ElFormItem></ElCol><ElCol :span="12"><ElFormItem :label="xt('版权文字')"><ElInput v-model="settings.siteContent.landing.copyright" /></ElFormItem></ElCol></ElRow><ElFormItem :label="xt('行动区说明')"><ElInput v-model="settings.siteContent.landing.finalDescription" type="textarea" :rows="2" /></ElFormItem><ElFormItem :label="xt('页尾品牌说明')"><ElInput v-model="settings.siteContent.landing.footerDescription" type="textarea" :rows="2" /></ElFormItem>
          </ElForm>
        </ElCard>
      </ElTabPane>

      <ElTabPane :label="xt('聊天主页 UI')" name="chat-ui"
        ><ElCard v-if="settings" shadow="never"
          ><template #header
            ><div class="card-title"
              ><strong>{{ xt('聊天主页 UI') }}</strong
              ><ElTag type="primary">{{ activePresetLabel }}</ElTag></div
            ></template
          ><ElFormItem :label="xt('聊天主页界面')"
            ><div class="chat-ui-presets" role="radiogroup" :aria-label="xt('聊天主页界面')"
              ><button
                v-for="preset in chatUiPresets"
                :key="preset.value"
                type="button"
                role="radio"
                :aria-checked="settings.chatUiPreset === preset.value"
                :class="{ active: settings.chatUiPreset === preset.value }"
                @click="settings.chatUiPreset = preset.value"
                ><span :class="`preset-preview preset-preview--${preset.value}`"
                  ><i /><i /><i /></span
                ><strong>{{ preset.label }}</strong
                ><small>{{ preset.note }}</small></button
              ></div
            ></ElFormItem
          ><section v-if="settings.chatUiPreset === 'doubao'" class="home-content-editor"
            ><header
              ><div
                ><strong>{{ xt('豆包推荐内容') }}</strong
                ><small>{{ xt('展示在首页输入框上方，点击后填入问题或打开链接') }}</small></div
              ><ElButton @click="addDoubaoRecommendation"
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增推荐') }}</ElButton
              ></header
            ><div
              class="content-row"
              v-for="(item, index) in settings.chatHomeContent.doubaoRecommendations"
              :key="index"
              ><ElInput v-model="item.title" :placeholder="xt('展示文字')" /><ElInput
                v-model="item.prompt"
                :placeholder="xt('填入输入框的问题')" /><ElInput
                v-model="item.targetUrl"
                placeholder="/office 或 https://..." /><ElButton
                text
                type="danger"
                @click="settings.chatHomeContent.doubaoRecommendations.splice(index, 1)"
                ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></div></section
          ><section v-else-if="settings.chatUiPreset === 'qianwen'" class="home-content-editor"
            ><header
              ><div
                ><strong>{{ xt('千问首页轮播') }}</strong
                ><small>{{ xt('支持标题、说明、按钮、封面图和站内外跳转') }}</small></div
              ><ElButton @click="addQianwenBanner"
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增轮播') }}</ElButton
              ></header
            ><article
              class="banner-editor"
              v-for="(item, index) in settings.chatHomeContent.qianwenBanners"
              :key="index"
              ><div class="banner-editor__number">{{ index + 1 }}</div
              ><div class="banner-editor__fields"
                ><ElInput v-model="item.title" :placeholder="xt('标题')" /><ElInput
                  v-model="item.description"
                  :placeholder="xt('说明文字')" /><ElInput
                  v-model="item.buttonText"
                  :placeholder="xt('按钮文字')" /><div class="banner-image-field"
                  ><ElInput v-model="item.imageUrl" :placeholder="xt('封面图片地址')" /><ElButton
                    plain
                    :loading="bannerUploadingIndex === index"
                    @click="uploadQianwenImage(index)"
                    ><ArtSvgIcon icon="ri:upload-2-line" />{{ xt('上传封面') }}</ElButton
                  ></div
                ><ElInput v-model="item.targetUrl" placeholder="/office 或 https://..." /></div
              ><ElButton
                text
                type="danger"
                @click="settings.chatHomeContent.qianwenBanners.splice(index, 1)"
                ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></article></section
          ><section v-else-if="settings.chatUiPreset === 'kimi'" class="home-content-editor"
            ><header
              ><div
                ><strong>{{ xt('Kimi 项目选择条') }}</strong
                ><small>{{ xt('展示在输入框下方') }}</small></div
              ></header
            ><div class="content-row content-row--two"
              ><ElInput
                v-model="settings.chatHomeContent.kimiProject.label"
                :placeholder="xt('显示名称')" /><ElInput
                v-model="settings.chatHomeContent.kimiProject.targetUrl"
                placeholder="/workspace?tab=projects" /></div></section
          ><section v-if="activeComposerControls" class="home-content-editor quick-action-editor"
            ><header
              ><div
                ><strong>{{ xt('快捷能力与执行') }}</strong
                ><small>{{ xt('控制当前界面的入口、排序、模型和联网策略') }}</small></div
              ><ElButton type="primary" plain @click="addQuickAction"
                ><ArtSvgIcon icon="ri:add-line" />{{ xt('新增能力') }}</ElButton
              ></header
            ><div class="quick-control-grid"
              ><ToggleRow
                v-model="activeComposerControls.modeEnabled"
                :title="xt('模式选择')"
                :note="xt('展示快速、专家和任务模式')" /><ToggleRow
                v-model="activeComposerControls.webSearchEnabled"
                :title="xt('联网开关')"
                :note="xt('允许用户手动开关联网搜索')" /><ToggleRow
                v-model="activeComposerControls.modelSelectorEnabled"
                :title="xt('模型选择')"
                :note="xt('允许用户临时切换可用模型')" /><ToggleRow
                v-model="activeComposerControls.moreEnabled"
                :title="xt('更多菜单')"
                :note="xt('展示收纳在更多中的快捷能力')" /></div
            ><div class="quick-action-note"
              ><ArtSvgIcon icon="ri:information-line" /><span
                >{{ xt('快捷能力只有在处理器、模型、路由和搜索依赖均可用时才会发布到用户端。') }}</span
              ></div
            ><div v-if="!activeQuickActions.length" class="quick-action-empty"
              >{{ xt('当前界面暂无快捷能力，可点击右上角新增。') }}</div
            ><article
              v-for="(action, index) in activeQuickActions"
              :key="action.id"
              class="quick-action-row"
              ><header
                ><span class="quick-action-order">{{ index + 1 }}</span
                ><div
                  ><strong>{{ action.label || xt('未命名能力') }}</strong
                  ><small>{{ action.id }}</small></div
                ><ElTag size="small" effect="plain">{{ action.placement === 'BAR' ? xt('主栏') : xt('更多') }}</ElTag
                ><ElTooltip :content="quickActionStatus(action)?.reason || xt('依赖检查通过')" placement="top"
                  ><ElTag size="small" effect="plain" :type="quickActionStatusType(action)"
                    >{{ quickActionStatusLabel(action) }}</ElTag
                  ></ElTooltip
                ><ElSwitch v-model="action.enabled" inline-prompt active-text="启" inactive-text="停" />
                <ElButton text :disabled="!canMoveQuickAction(action.id, -1)" :title="xt('上移')" @click="moveQuickAction(action.id, -1)"
                  ><ArtSvgIcon icon="ri:arrow-up-line" /></ElButton
                ><ElButton text :disabled="!canMoveQuickAction(action.id, 1)" :title="xt('下移')" @click="moveQuickAction(action.id, 1)"
                  ><ArtSvgIcon icon="ri:arrow-down-line" /></ElButton
                ><ElButton text type="danger" :title="xt('删除')" @click="removeQuickAction(action.id)"
                  ><ArtSvgIcon icon="ri:delete-bin-line" /></ElButton></header
              ><div class="quick-action-fields"
                ><ElFormItem :label="xt('显示名称')"
                  ><ElInput v-model.trim="action.label" maxlength="60" /></ElFormItem
                ><ElFormItem :label="xt('图标')"
                  ><ElSelect v-model="action.icon" filterable
                    ><ElOption
                      v-for="option in quickActionIconOptions"
                      :key="option[0]"
                      :label="option[1]"
                      :value="option[0]" /></ElSelect></ElFormItem
                ><ElFormItem :label="xt('展示位置')"
                  ><ElSelect v-model="action.placement"
                    ><ElOption :label="xt('主栏')" value="BAR" /><ElOption
                      :label="xt('更多菜单')"
                      value="MORE" /></ElSelect></ElFormItem
                ><ElFormItem :label="xt('动作类型')"
                  ><ElSelect v-model="action.actionType" @change="resetQuickActionTarget(action)"
                    ><ElOption :label="xt('填入提示词')" value="PROMPT" /><ElOption
                      :label="xt('打开办公任务')"
                      value="OFFICE" /><ElOption
                      :label="xt('功能跳转')"
                      value="ROUTE" /></ElSelect></ElFormItem
                ><ElFormItem v-if="action.actionType === 'OFFICE'" :label="xt('办公能力')"
                  ><ElSelect v-model="action.target" filterable
                    ><ElOption
                      v-for="target in officeTargets"
                      :key="target[0]"
                      :label="target[1]"
                      :value="target[0]" /></ElSelect></ElFormItem
                ><ElFormItem v-else-if="action.actionType === 'ROUTE'" :label="xt('跳转地址')"
                  ><ElInput v-model.trim="action.target" placeholder="/image 或 https://..." /></ElFormItem
                ><ElFormItem :label="xt('执行模型')"
                  ><ElSelect v-model="action.modelKey" clearable filterable :placeholder="xt('跟随当前或默认模型')"
                    ><ElOption
                      v-for="item in chatModels"
                      :key="item.id"
                      :label="item.displayName"
                      :value="item.key" /></ElSelect></ElFormItem
                ><ElFormItem :label="xt('排序值')"
                  ><ElInputNumber v-model="action.sortOrder" :min="-10000" :max="10000" /></ElFormItem
                ><ElFormItem class="quick-action-web-search" :label="xt('自动联网')"
                  ><ElSwitch v-model="action.webSearch" /></ElFormItem
                ><ElFormItem
                  v-if="action.actionType !== 'ROUTE'"
                  class="quick-action-prompt"
                  :label="action.actionType === 'OFFICE' ? xt('预填任务提示') : xt('提示词')"
                  ><ElInput
                    v-model="action.prompt"
                    type="textarea"
                    :rows="2"
                    maxlength="4000"
                    show-word-limit /></ElFormItem></div></article></section></ElCard
      ></ElTabPane>
    </ElTabs>
    <ElDialog v-model="mfaSetupDialog" :title="xt('绑定身份验证器')" width="520px" :close-on-click-modal="false"><div v-if="mfaSetup" class="mfa-setup"><img :src="mfaSetup.qrCodeDataUrl" :alt="xt('MFA 二维码')" /><div><p>{{ xt('使用任意兼容 TOTP 的身份验证器扫描二维码，然后输入 6 位动态验证码。') }}</p><code>{{ mfaSetup.secret }}</code><ElInput v-model.trim="mfaSetupCode" maxlength="6" autocomplete="one-time-code" :placeholder="xt('6 位动态验证码')" /></div></div><template #footer><ElButton @click="mfaSetupDialog = false">{{ xt('取消') }}</ElButton><ElButton type="primary" :loading="mfaBusy" @click="enableMfa">{{ xt('验证并启用') }}</ElButton></template></ElDialog>
    <ElDialog v-model="recoveryDialog" :title="xt('保存恢复码')" width="560px" :close-on-click-modal="false" :close-on-press-escape="false"><p class="recovery-note">{{ xt('每枚恢复码只能使用一次。请离线保存；关闭后系统不会再次显示这些明文。') }}</p><div class="recovery-grid"><code v-for="code in recoveryCodes" :key="code">{{ code }}</code></div><template #footer><ElButton @click="copyRecoveryCodes">{{ xt('复制全部') }}</ElButton><ElButton type="primary" @click="recoveryDialog = false">{{ xt('我已保存') }}</ElButton></template></ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import {
    xinyueApi,
    type AdminMfaSetup,
    type AdminMfaStatus,
    type ChatHomeContent,
    type ChatQuickAction,
    type ChatUiPreset,
    type ModelPreset,
    type SubscriptionPlan,
    type SiteContent,
    type SystemSettings,
    type UserGroup
  } from '@/api/xinyue'
  import { xinyueText as xt } from '@/locales/xinyue'
  import ToggleRow from './toggle-row.vue'
  defineOptions({ name: 'XinyueSettings' })
  const route = useRoute()
  const router = useRouter()
  const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'site')
  const settings = ref<SystemSettings | null>(null)
  const groups = ref<UserGroup[]>([])
  const plans = ref<SubscriptionPlan[]>([])
  const models = ref<ModelPreset[]>([])
  const saving = ref(false)
  const domainsText = ref('')
  const smtpPassword = ref('')
  const linuxSecret = ref('')
  const mfaStatus = reactive<AdminMfaStatus>({ enabled: false, enabledAt: null, recoveryCodesRemaining: 0 })
  const mfaSetup = ref<AdminMfaSetup | null>(null)
  const mfaSetupDialog = ref(false)
  const recoveryDialog = ref(false)
  const mfaSetupCode = ref('')
  const mfaCode = ref('')
  const mfaPassword = ref('')
  const recoveryCodes = ref<string[]>([])
  const mfaBusy = ref(false)
  const bannerUploadingIndex = ref<number | null>(null)
  const workspaceSidebarEnabled = computed({
    get: () => Boolean(settings.value?.sidebarProjectsEnabled || settings.value?.sidebarAssetsEnabled),
    set: (enabled: boolean) => {
      if (!settings.value) return
      settings.value.sidebarProjectsEnabled = enabled
      settings.value.sidebarAssetsEnabled = enabled
    }
  })
  const editableSettingKeys = [
    'siteName',
    'siteLogoUrl',
    'supportUrl',
    'sidebarCreationEnabled',
    'sidebarCommerceEnabled',
    'sidebarOfficeEnabled',
    'sidebarPromptsEnabled',
    'sidebarPluginsEnabled',
    'sidebarProjectsEnabled',
    'sidebarAssetsEnabled',
    'registrationEnabled',
    'emailLoginEnabled',
    'emailVerifyEnabled',
    'passwordLoginEnabled',
    'passwordRegistrationEnabled',
    'linuxDoLoginEnabled',
    'linuxDoClientId',
    'linuxDoRedirectUrl',
    'linuxDoScopes',
    'linuxDoAuthorizeUrl',
    'linuxDoTokenUrl',
    'linuxDoUserInfoUrl',
    'otpTtlMinutes',
    'otpResendSeconds',
    'defaultUserCredits',
    'defaultTheme',
    'defaultLanguage',
    'chatUiPreset',
    'chatHomeContent',
    'siteContent',
    'defaultChatModelKey',
    'defaultImageModelKey',
    'userByokEnabled',
    'inviteRewardCredits',
    'referralEnabled',
    'referralCoolingDays',
    'referralMinimumPaidCents',
    'referralMonthlyRewardLimit',
    'referralAutoApprove',
    'rechargeEnabled',
    'minRechargeCents',
    'currency',
    'creditValueMicros',
    'modelImportMarkupPercent',
    'modelPriceCatalogUrl',
    'modelPriceCatalogRefreshHours',
    'subscriptionsEnabled',
    'trialEnabled',
    'defaultTrialPlanId',
    'trialCredits',
    'defaultUserGroupId',
    'temporaryChatRetentionHours',
    'defaultChatHistoryEnabled',
    'defaultTrainingOptOut',
    'defaultShareUsageAnalytics',
    'smtpEnabled',
    'smtpHost',
    'smtpPort',
    'smtpSecure',
    'smtpUsername',
    'smtpFromName',
    'smtpFromEmail'
  ] as const satisfies readonly (keyof SystemSettings)[]
  const chatUiPresets = [
    { value: 'gpt', label: 'GPT', note: xt('紧凑居中') },
    { value: 'doubao', label: xt('豆包'), note: xt('推荐与双层输入') },
    { value: 'qianwen', label: xt('千问'), note: xt('能力入口布局') },
    { value: 'kimi', label: 'Kimi', note: xt('品牌字标与任务入口') }
  ] as const
  const defaultChatHomeContent: ChatHomeContent = {
    doubaoRecommendations: [
      {
        title: '热点：北语教授刘宗迪称《山海经》并非怪物图鉴',
        prompt: '请介绍这个热点，并说明相关观点和背景。',
        targetUrl: ''
      },
      {
        title: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？',
        prompt: '语言模型的训练数据如何影响 AI 回答的准确性和多样性？',
        targetUrl: ''
      }
    ],
    qianwenBanners: [
      {
        title: 'Xinyue 办公助理上线',
        description: '解锁本地任务能力，多格式交付',
        buttonText: '立即体验',
        imageUrl: '',
        targetUrl: '/office'
      }
    ],
    kimiProject: { label: '选择项目', targetUrl: '/workspace?tab=projects' },
    composerControls: {
      gpt: { modeEnabled: false, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: false },
      doubao: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
      qianwen: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true },
      kimi: { modeEnabled: true, webSearchEnabled: true, modelSelectorEnabled: true, moreEnabled: true }
    },
    quickActions: { gpt: [], doubao: [], qianwen: [], kimi: [] }
  }
  function normalizeChatHomeContent(value: unknown): ChatHomeContent {
    const source =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Partial<ChatHomeContent>)
        : {}
    return {
      doubaoRecommendations: Array.isArray(source.doubaoRecommendations)
        ? source.doubaoRecommendations
        : structuredClone(defaultChatHomeContent.doubaoRecommendations),
      qianwenBanners: Array.isArray(source.qianwenBanners)
        ? source.qianwenBanners
        : structuredClone(defaultChatHomeContent.qianwenBanners),
      kimiProject:
        source.kimiProject && typeof source.kimiProject === 'object'
          ? {
              label: source.kimiProject.label || defaultChatHomeContent.kimiProject.label,
              targetUrl:
                source.kimiProject.targetUrl || defaultChatHomeContent.kimiProject.targetUrl
            }
          : { ...defaultChatHomeContent.kimiProject },
      composerControls: {
        ...structuredClone(defaultChatHomeContent.composerControls),
        ...(source.composerControls || {})
      },
      quickActions: {
        ...structuredClone(defaultChatHomeContent.quickActions),
        ...(source.quickActions || {})
      }
    }
  }
  const activePresetLabel = computed(
    () => chatUiPresets.find((item) => item.value === settings.value?.chatUiPreset)?.label || 'GPT'
  )
  const trialPlans = computed(() =>
    plans.value.filter((item) => item.enabled && item.trialDays > 0)
  )
  const chatModels = computed(() =>
    models.value.filter((item) => item.enabled && item.capability === 'CHAT')
  )
  const imageModels = computed(() =>
    models.value.filter((item) => item.enabled && item.capability === 'IMAGE')
  )
  const activeChatPreset = computed<ChatUiPreset>(() => settings.value?.chatUiPreset || 'gpt')
  const activeComposerControls = computed(
    () => settings.value?.chatHomeContent.composerControls[activeChatPreset.value]
  )
  const activeQuickActions = computed(() => {
    const actions = settings.value?.chatHomeContent.quickActions[activeChatPreset.value] || []
    return [...actions].sort(
      (left, right) =>
        (left.placement === right.placement ? 0 : left.placement === 'BAR' ? -1 : 1) ||
        left.sortOrder - right.sortOrder ||
        left.label.localeCompare(right.label, 'zh-CN')
    )
  })
  function quickActionStatus(action: ChatQuickAction) {
    return settings.value?.quickActionRegistry?.actions.find(
      (item) => item.preset === activeChatPreset.value && item.id === action.id
    )
  }
  function quickActionStatusType(action: ChatQuickAction) {
    if (!action.enabled) return 'info'
    return quickActionStatus(action)?.published ? 'success' : 'danger'
  }
  function quickActionStatusLabel(action: ChatQuickAction) {
    if (!action.enabled) return xt('已停用')
    const status = quickActionStatus(action)
    if (!status) return xt('保存后检测')
    return status.published ? xt('可发布') : xt('缺少依赖')
  }
  const quickActionIconOptions = [
    ['sparkles', '智能'],
    ['video', '视频'],
    ['music', '音乐'],
    ['image', '图像'],
    ['podcast', '播客'],
    ['table', '表格'],
    ['writing', '写作'],
    ['transcribe', '转写'],
    ['ppt', 'PPT'],
    ['translate', '翻译'],
    ['research', '研究'],
    ['answer', '答疑'],
    ['code', '代码'],
    ['document', '文档'],
    ['website', '网站'],
    ['design', '设计'],
    ['office', '办公']
  ] as const
  const officeTargets = [
    ['daily', '日常办公'],
    ['writing', '内容创作'],
    ['analysis', '数据分析'],
    ['development', '代码开发'],
    ['ppt', 'PPT 生成'],
    ['report', '报告撰写'],
    ['meeting', '会议纪要'],
    ['spreadsheet', '多维表格'],
    ['excel', 'Excel 助手']
  ] as const
  const linuxReady = computed(() =>
    Boolean(
      settings.value?.linuxDoClientId &&
      settings.value?.linuxDoRedirectUrl &&
      (settings.value?.hasLinuxDoClientSecret || linuxSecret.value)
    )
  )
  const smtpReady = computed(() =>
    Boolean(
      settings.value?.smtpHost &&
      settings.value?.smtpFromEmail &&
      (settings.value?.hasSmtpPassword || smtpPassword.value)
    )
  )
  async function load() {
    const [loadedSettings, loadedGroups, loadedPlans, loadedModels, loadedMfaStatus] = await Promise.all([
      xinyueApi.systemSettings(),
      xinyueApi.groups(),
      xinyueApi.plans(),
      xinyueApi.models(),
      xinyueApi.adminMfaStatus()
    ])
    loadedSettings.chatHomeContent = normalizeChatHomeContent(loadedSettings.chatHomeContent)
    loadedSettings.siteContent = normalizeSiteContent(loadedSettings.siteContent)
    settings.value = loadedSettings
    groups.value = loadedGroups
    plans.value = loadedPlans
    models.value = loadedModels
    Object.assign(mfaStatus, loadedMfaStatus)
    domainsText.value = settings.value.allowedEmailDomains.join('\n')
    smtpPassword.value = ''
    linuxSecret.value = ''
  }
  function normalizeSiteContent(value: SiteContent | null | undefined): SiteContent {
    const landing = value?.landing
    return {
      landing: {
        heroLead: landing?.heroLead || '在一个平台，完成',
        modes: Array.isArray(landing?.modes) ? landing.modes : [],
        navGroups: Array.isArray(landing?.navGroups) ? landing.navGroups : [],
        previewNav: Array.isArray(landing?.previewNav) ? landing.previewNav : [],
        trustTitle: landing?.trustTitle || '', trustDescription: landing?.trustDescription || '',
        trustItems: Array.isArray(landing?.trustItems) ? landing.trustItems : [],
        linksTitle: landing?.linksTitle || '', linksDescription: landing?.linksDescription || '',
        capabilityLinks: Array.isArray(landing?.capabilityLinks) ? landing.capabilityLinks : [],
        faqTitle: landing?.faqTitle || '', faqs: Array.isArray(landing?.faqs) ? landing.faqs : [],
        finalTitle: landing?.finalTitle || '', finalDescription: landing?.finalDescription || '',
        footerDescription: landing?.footerDescription || '', copyright: landing?.copyright || ''
      }
    }
  }
  function formatMfaTime(value: string | null) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-' }
  async function beginMfaSetup() { mfaBusy.value = true; try { mfaSetup.value = await xinyueApi.beginAdminMfaSetup(); mfaSetupCode.value = ''; mfaSetupDialog.value = true } finally { mfaBusy.value = false } }
  async function enableMfa() { if (!mfaSetup.value || !/^\d{6}$/.test(mfaSetupCode.value)) return ElMessage.warning(xt('请输入 6 位动态验证码')); mfaBusy.value = true; try { const result = await xinyueApi.enableAdminMfa(mfaSetup.value.ticket, mfaSetupCode.value); recoveryCodes.value = result.recoveryCodes; mfaSetupDialog.value = false; recoveryDialog.value = true; Object.assign(mfaStatus, await xinyueApi.adminMfaStatus()) } finally { mfaBusy.value = false } }
  async function regenerateRecoveryCodes() { if (!mfaCode.value) return ElMessage.warning(xt('请输入动态验证码或恢复码')); mfaBusy.value = true; try { const result = await xinyueApi.regenerateAdminMfaRecoveryCodes(mfaCode.value); recoveryCodes.value = result.recoveryCodes; recoveryDialog.value = true; mfaCode.value = ''; Object.assign(mfaStatus, await xinyueApi.adminMfaStatus()) } finally { mfaBusy.value = false } }
  async function verifyCurrentSession() { if (!mfaCode.value) return ElMessage.warning(xt('请输入动态验证码或恢复码')); mfaBusy.value = true; try { await xinyueApi.verifyAdminMfaSession(mfaCode.value); mfaCode.value = ''; ElMessage.success(xt('当前会话已完成安全验证，15 分钟内可执行管理写操作')) } finally { mfaBusy.value = false } }
  async function disableMfa() { if (!mfaPassword.value || !mfaCode.value) return ElMessage.warning(xt('请输入密码和动态验证码')); mfaBusy.value = true; try { await xinyueApi.disableAdminMfa(mfaPassword.value, mfaCode.value); mfaPassword.value = ''; mfaCode.value = ''; Object.assign(mfaStatus, await xinyueApi.adminMfaStatus()); ElMessage.success(xt('MFA 已停用')) } finally { mfaBusy.value = false } }
  async function copyRecoveryCodes() { await navigator.clipboard.writeText(recoveryCodes.value.join('\n')); ElMessage.success(xt('恢复码已复制')) }
  function fillCallback() {
    if (settings.value)
      settings.value.linuxDoRedirectUrl = `${window.location.origin}/v1/auth/oauth/linuxdo/callback`
  }
  function addDoubaoRecommendation() {
    settings.value?.chatHomeContent.doubaoRecommendations.push({
      title: '',
      prompt: '',
      targetUrl: ''
    })
  }
  function addQianwenBanner() {
    settings.value?.chatHomeContent.qianwenBanners.push({
      title: '',
      description: '',
      buttonText: '立即体验',
      imageUrl: '',
      targetUrl: '/office'
    })
  }
  function addQuickAction() {
    if (!settings.value) return
    const actions = settings.value.chatHomeContent.quickActions[activeChatPreset.value]
    const nextOrder = actions.length ? Math.max(...actions.map((item) => item.sortOrder)) + 10 : 10
    actions.push({
      id: `${activeChatPreset.value}-${Date.now().toString(36)}`,
      label: '新快捷能力',
      icon: 'sparkles',
      placement: 'MORE',
      actionType: 'PROMPT',
      prompt: '',
      target: '',
      modelKey: '',
      webSearch: false,
      enabled: true,
      sortOrder: nextOrder
    })
  }
  function removeQuickAction(id: string) {
    if (!settings.value) return
    const actions = settings.value.chatHomeContent.quickActions[activeChatPreset.value]
    const index = actions.findIndex((item) => item.id === id)
    if (index >= 0) actions.splice(index, 1)
  }
  function moveQuickAction(id: string, offset: -1 | 1) {
    if (!settings.value) return
    const current = activeQuickActions.value.find((item) => item.id === id)
    if (!current) return
    const sorted = activeQuickActions.value.filter((item) => item.placement === current.placement)
    const index = sorted.findIndex((item) => item.id === id)
    const targetIndex = index + offset
    if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return
    const currentOrder = sorted[index].sortOrder
    sorted[index].sortOrder = sorted[targetIndex].sortOrder
    sorted[targetIndex].sortOrder = currentOrder
    if (sorted[index].sortOrder === sorted[targetIndex].sortOrder) {
      sorted.forEach((item, itemIndex) => {
        item.sortOrder = (itemIndex + 1) * 10
      })
    }
  }
  function canMoveQuickAction(id: string, offset: -1 | 1) {
    const current = activeQuickActions.value.find((item) => item.id === id)
    if (!current) return false
    const group = activeQuickActions.value.filter((item) => item.placement === current.placement)
    const index = group.findIndex((item) => item.id === id)
    return index + offset >= 0 && index + offset < group.length
  }
  function resetQuickActionTarget(action: ChatQuickAction) {
    if (action.actionType === 'PROMPT') action.target = ''
    else if (action.actionType === 'OFFICE' && !officeTargets.some(([value]) => value === action.target))
      action.target = 'daily'
    else if (action.actionType === 'ROUTE' && !action.target) action.target = '/chat'
  }
  async function uploadQianwenImage(index: number) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !settings.value) return
      bannerUploadingIndex.value = index
      try {
        const data = new FormData()
        data.append('file', file)
        const result = await xinyueApi.uploadChatHomeImage(data)
        settings.value.chatHomeContent.qianwenBanners[index].imageUrl = result.imageUrl
      } finally {
        bannerUploadingIndex.value = null
      }
    }
    input.click()
  }
  async function save() {
    if (!settings.value) return
    if (settings.value.linuxDoLoginEnabled && !linuxReady.value) {
      tab.value = 'auth'
      return ElMessage.warning(xt('启用 Linux.do 前请完整填写 Client ID、Secret 和回调地址'))
    }
    const body = Object.fromEntries(editableSettingKeys.map((key) => [key, settings.value![key]]))
    saving.value = true
    try {
      settings.value = await xinyueApi.saveSystemSettings({
        ...body,
        allowedEmailDomains: domainsText.value
          .split(/[\n,，;；]+/)
          .map((item) => item.trim().replace(/^@/, ''))
          .filter(Boolean),
        ...(smtpPassword.value ? { smtpPassword: smtpPassword.value } : {}),
        ...(linuxSecret.value ? { linuxDoClientSecret: linuxSecret.value } : {})
      })
      domainsText.value = settings.value.allowedEmailDomains.join('\n')
      smtpPassword.value = ''
      linuxSecret.value = ''
    } finally {
      saving.value = false
    }
  }
  onMounted(load)
  watch(tab, (value) => {
    void router.replace({ query: { ...route.query, tab: value } })
  })
  watch(
    () => route.query.tab,
    (value) => {
      if (typeof value === 'string' && value !== tab.value) tab.value = value
    }
  )
</script>

<style scoped>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .page-title {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }

  .page-title > div {
    min-width: 0;
  }

  .page-title h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }

  .page-title p {
    margin: 0;
    font-size: 13px;
    color: var(--art-gray-500);
  }

  .settings-tabs {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .settings-tabs :deep(.el-tabs__header) {
    flex: 0 0 auto;
    margin-bottom: 12px;
  }

  .settings-tabs :deep(.el-tabs__nav) {
    max-width: 100%;
  }

  .settings-tabs :deep(.el-tabs__content) {
    min-width: 0;
    max-width: 100%;
    height: 100%;
    overflow: auto;
  }

  .settings-tabs :deep(.el-tab-pane) {
    display: grid;
    gap: 12px;
    width: 100%;
    min-width: 0;
  }

  .settings-tabs :deep(.el-card) {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .settings-tabs :deep(.el-card__body),
  .settings-tabs :deep(.el-card__header) {
    min-width: 0;
    max-width: 100%;
  }
  .mfa-overview { align-items: center; display: flex; gap: 20px; justify-content: space-between; }
  .mfa-overview > div { align-items: center; display: flex; gap: 14px; min-width: 0; }
  .mfa-overview > div > .art-svg-icon { color: var(--main-color); flex: 0 0 auto; font-size: 28px; }
  .mfa-overview span { display: grid; gap: 5px; }
  .mfa-overview small,.recovery-note { color: var(--art-gray-500); font-size: 12px; line-height: 1.6; }
  .mfa-actions { max-width: 520px; }
  .mfa-setup { align-items: center; display: grid; gap: 22px; grid-template-columns: 220px minmax(0, 1fr); }
  .mfa-setup img { border: 1px solid var(--art-gray-200); border-radius: 6px; display: block; width: 220px; }
  .mfa-setup > div { display: grid; gap: 14px; min-width: 0; }
  .mfa-setup p { color: var(--art-gray-600); line-height: 1.7; margin: 0; }
  .mfa-setup code { background: var(--art-gray-100); border-radius: 5px; overflow-wrap: anywhere; padding: 9px; text-align: center; }
  .recovery-grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
  .recovery-grid code { background: var(--art-gray-100); border-radius: 5px; padding: 9px; text-align: center; }

  .settings-tabs :deep(.el-row),
  .settings-tabs :deep(.el-col) {
    min-width: 0;
    max-width: 100%;
  }

  .settings-tabs :deep(.el-input),
  .settings-tabs :deep(.el-select),
  .settings-tabs :deep(.el-input-number) {
    max-width: 100%;
  }

  .card-title {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .card-title > div { display: grid; gap: 3px; }
  .card-title > div small { color: var(--art-gray-500); font-size: 12px; font-weight: 400; }
  .public-content-form { max-width: 1120px; }
  .site-content-list { display: grid; gap: 10px; margin-bottom: 16px; }
  .site-content-list > article,
  .site-content-list > .site-content-inline { background: var(--art-gray-50); border: 1px solid var(--art-gray-200); border-radius: 6px; display: grid; gap: 10px; padding: 12px; }
  .site-content-list article > header { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
  .site-content-fields { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .site-content-fields :deep(.el-textarea) { grid-column: 1 / -1; }
  .site-content-inline { align-items: center; display: grid; gap: 8px; grid-template-columns: minmax(120px, .7fr) minmax(180px, 1.5fr) minmax(160px, 1fr) 32px; }

  .toggle-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .chat-ui-presets {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
  }

  .chat-ui-presets > button {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    color: var(--art-gray-700);
    text-align: left;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 8px;
  }

  .chat-ui-presets > button:hover {
    border-color: var(--el-color-primary-light-5);
  }

  .chat-ui-presets > button.active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  }

  .chat-ui-presets strong {
    font-size: 13px;
  }

  .chat-ui-presets small {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    color: var(--art-gray-500);
    white-space: nowrap;
  }

  .preset-preview {
    position: relative;
    display: block;
    height: 42px;
    margin-bottom: 3px;
    overflow: hidden;
    background: var(--art-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 5px;
  }

  .preset-preview i {
    position: absolute;
    display: block;
    background: var(--art-gray-300);
  }

  .preset-preview i:first-child {
    top: 9px;
    left: 50%;
    width: 34%;
    height: 5px;
    border-radius: 3px;
    transform: translateX(-50%);
  }

  .preset-preview i:nth-child(2) {
    right: 13%;
    bottom: 8px;
    left: 13%;
    height: 10px;
    border-radius: 6px;
  }

  .preset-preview i:nth-child(3) {
    right: 16%;
    bottom: 11px;
    width: 5px;
    height: 5px;
    background: var(--el-color-primary);
    border-radius: 50%;
  }

  .preset-preview--doubao i:first-child {
    width: 26%;
  }

  .preset-preview--doubao i:nth-child(2) {
    height: 15px;
    border-radius: 4px;
  }

  .preset-preview--qianwen i:first-child {
    left: 17%;
    width: 24%;
    transform: none;
  }

  .preset-preview--qianwen i:nth-child(2) {
    right: 20%;
    left: 20%;
  }

  .preset-preview--kimi {
    background: #1d1d1d;
  }

  .preset-preview--kimi i:first-child {
    width: 30%;
    background: #eee;
  }

  .preset-preview--kimi i:nth-child(2) {
    right: 18%;
    left: 18%;
    background: #333;
    border: 1px solid #555;
  }

  .form-block,
  .number-row {
    margin-top: 18px;
  }

  .wide {
    width: 100%;
  }

  .home-content-editor {
    display: grid;
    gap: 10px;
    padding: 14px;
    margin: 8px 0 20px;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 8px;
  }

  .home-content-editor > header {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  .home-content-editor > header > div {
    display: grid;
    gap: 3px;
  }

  .home-content-editor > header small {
    font-size: 11px;
    color: var(--art-gray-500);
  }

  .quick-action-editor {
    margin-top: 12px;
  }

  .quick-control-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .quick-action-note {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--art-gray-600);
    background: var(--el-color-primary-light-9);
    border: 1px solid var(--el-color-primary-light-7);
    border-radius: 6px;
  }

  .quick-action-note .art-svg-icon {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--el-color-primary);
  }

  .quick-action-empty {
    padding: 24px 16px;
    font-size: 13px;
    color: var(--art-gray-500);
    text-align: center;
    border: 1px dashed var(--art-border-color);
    border-radius: 6px;
  }

  .quick-action-row {
    min-width: 0;
    padding: 12px;
    background: var(--art-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 7px;
  }

  .quick-action-row > header {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    padding-bottom: 10px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--art-border-color);
  }

  .quick-action-row > header > div {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .quick-action-row > header strong,
  .quick-action-row > header small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quick-action-row > header strong {
    font-size: 13px;
  }

  .quick-action-row > header small {
    font-size: 11px;
    color: var(--art-gray-500);
  }

  .quick-action-row > header :deep(.el-button) {
    width: 30px;
    height: 30px;
    padding: 0;
    margin-left: 0;
  }

  .quick-action-order {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 26px;
    height: 26px;
    font-size: 11px;
    color: var(--art-gray-500);
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 6px;
  }

  .quick-action-fields {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px 12px;
    min-width: 0;
  }

  .quick-action-fields :deep(.el-form-item) {
    min-width: 0;
    margin-bottom: 0;
  }

  .quick-action-fields :deep(.el-select),
  .quick-action-fields :deep(.el-input-number) {
    width: 100%;
  }

  .quick-action-prompt {
    grid-column: span 2;
  }

  .quick-action-web-search :deep(.el-form-item__content) {
    min-height: 32px;
  }

  .content-row {
    display: grid;
    grid-template-columns: 1.15fr 1.2fr 1fr 34px;
    gap: 8px;
    align-items: center;
  }

  .content-row--two {
    grid-template-columns: minmax(0, 0.65fr) minmax(0, 1.35fr);
  }

  .banner-editor {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: start;
    padding-top: 10px;
    border-top: 1px solid var(--art-border-color);
  }

  .banner-editor__number {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    color: var(--art-gray-500);
    background: var(--art-bg-color);
    border-radius: 6px;
  }

  .banner-editor__fields {
    display: grid;
    grid-template-columns: 1fr 1.3fr 0.6fr 1fr 1fr;
    gap: 8px;
    min-width: 0;
  }

  .banner-image-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    min-width: 0;
  }

  @media (width <= 800px) {
    .site-content-fields,
    .site-content-inline { grid-template-columns: 1fr; }
    .settings-page {
      height: auto;
      overflow: visible;
    }

    .page-title {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .page-title h1 {
      font-size: 20px;
    }

    .page-title :deep(.el-button) {
      margin-left: auto;
    }

    .settings-tabs {
      display: flex;
      flex-direction: column;
      height: auto;
    }

    .settings-tabs :deep(.el-tabs__header) {
      display: block;
      flex: 0 0 40px;
      width: 100%;
      height: 40px;
      margin: 0 0 8px;
      overflow: auto hidden;
    }

    .settings-tabs :deep(.el-tabs__nav-wrap),
    .settings-tabs :deep(.el-tabs__nav-scroll) {
      overflow: visible;
    }

    .settings-tabs :deep(.el-tabs__nav-wrap) {
      width: 100%;
      height: 40px;
      margin: 0;
    }

    .settings-tabs :deep(.el-tabs__nav-scroll) {
      width: 100%;
      height: 40px;
    }

    .settings-tabs :deep(.el-tabs__nav) {
      display: flex;
      flex-direction: row !important;
      flex-wrap: nowrap;
      width: max-content;
      min-width: max-content;
      height: 40px;
    }

    .settings-tabs :deep(.el-tabs__item) {
      height: 38px;
      padding: 0 14px;
      white-space: nowrap;
    }

    .settings-tabs :deep(.el-tabs__active-bar) {
      right: auto;
      bottom: 0;
    }

    .settings-tabs :deep(.el-tabs__content) {
      height: auto;
      overflow: visible;
    }

    .settings-tabs :deep(.el-tab-pane) {
      max-width: none;
    }

    .toggle-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .quick-control-grid,
    .quick-action-fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .quick-action-prompt {
      grid-column: auto;
    }

    .quick-action-row > header {
      flex-wrap: wrap;
    }

    .quick-action-row > header > div {
      flex-basis: calc(100% - 42px);
    }

    .chat-ui-presets {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .content-row,
    .content-row--two,
    .banner-editor__fields {
      grid-template-columns: minmax(0, 1fr);
    }

    .settings-tabs :deep(.el-col) {
      flex: 0 0 100%;
      width: 100%;
      max-width: 100%;
    }
  }
</style>
