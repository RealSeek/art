<template>
  <div class="workspace-shell" :class="{ 'is-collapsed': !sidebarOpen, 'is-canvas-route': props.canvasRoute }">
    <button
      v-if="mobileOpen"
      class="workspace-backdrop"
      type="button"
      aria-label="关闭菜单"
      @click="mobileOpen = false"
    />

    <aside class="workspace-sidebar" :class="{ 'is-mobile-open': mobileOpen }">
      <div class="workspace-sidebar__top">
        <BrandMark to="/chat" dark :compact="!sidebarOpen" />
        <button class="icon-button sidebar-close" type="button" aria-label="关闭边栏" @click="sidebarOpen = !sidebarOpen">
          <PanelLeftClose :size="18" />
        </button>
        <button class="icon-button mobile-close" type="button" aria-label="关闭菜单" @click="mobileOpen = false">
          <X :size="19" />
        </button>
      </div>

      <div class="workspace-sidebar__scroll" @scroll="closeConversationMenu">
      <nav class="workspace-menu" aria-label="工作台导航">
        <a
          v-for="item in navItems"
          :key="item.key"
          :href="item.to"
          :target="item.external && item.openNewTab ? '_blank' : undefined"
          :rel="item.external && item.openNewTab ? 'noreferrer' : undefined"
          class="workspace-menu__item"
          :class="{ 'is-active': !item.external && (item.activeModes || [item.mode]).includes(activeMode) && (item.mode !== 'chat' || !studio.currentConversationId) }"
          :title="!sidebarOpen ? item.label : undefined"
          @click="handleNavLink($event, item)"
        >
          <component :is="item.icon" :size="19" />
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <section v-if="auth.isAuthenticated && sidebarOpen" class="workspace-recent">
        <header class="workspace-recent__header"><button class="workspace-recent__toggle" type="button" :aria-expanded="recentOpen" @click="recentOpen = !recentOpen">{{ t('workspace.recent') }} <ChevronDown :size="14" :class="{ 'is-up': recentOpen }" /></button><button class="workspace-recent__search-button" type="button" aria-label="搜索对话" title="搜索对话" @click="recentSearchOpen = !recentSearchOpen; recentOpen = true"><Search :size="15" /></button></header>
        <div v-if="recentOpen" class="workspace-recent__body">
          <label v-if="recentSearchOpen" class="workspace-recent__search-field"><Search :size="14" /><input v-model="conversationSearch" aria-label="搜索对话" placeholder="搜索对话" /></label>
          <div v-for="conversation in visibleRecentConversations" :key="conversation.id" class="workspace-recent-row" :class="{ 'is-active': activeMode === 'chat' && conversation.id === studio.currentConversationId }">
            <form v-if="renamingConversationId === conversation.id" class="workspace-recent-rename" @submit.prevent="saveConversationRename(conversation.id)">
              <input v-model="conversationRename" maxlength="120" aria-label="对话名称" autofocus :disabled="conversationRenameBusy" @keydown.esc="cancelConversationRename" />
              <button type="submit" aria-label="保存重命名" title="保存" :disabled="conversationRenameBusy || !conversationRename.trim()"><LoaderCircle v-if="conversationRenameBusy" :size="14" /><Check v-else :size="14" /></button>
              <button type="button" aria-label="取消重命名" title="取消" :disabled="conversationRenameBusy" @click="cancelConversationRename"><X :size="14" /></button>
            </form>
            <template v-else>
              <button class="workspace-recent-item" type="button" :title="conversation.title" @click="openConversation(conversation.id)" @dblclick.prevent="startConversationRename(conversation)">{{ conversation.title }}</button>
              <span v-if="conversation.pinnedAt" class="workspace-recent-pin" :title="`已置顶：${conversation.title}`"><Pin :size="12" /></span>
              <button class="workspace-recent-edit" type="button" :aria-label="`重命名“${conversation.title}”`" title="重命名" @click.stop="startConversationRename(conversation)"><Pencil :size="14" /></button>
              <button class="workspace-recent-more" type="button" :aria-label="`打开“${conversation.title}”的对话选项`" :aria-expanded="conversationMenuId === conversation.id" @click.stop="openConversationMenu($event, conversation)"><MoreHorizontal :size="17" /></button>
            </template>
          </div>
          <p v-if="studio.workspaceHydrating && !studio.conversations.length">正在加载对话...</p>
          <p v-else-if="!filteredConversations.length">{{ conversationSearch ? '没有匹配的对话' : t('workspace.noChats') }}</p>
          <button v-else-if="hasMoreRecentConversations" class="workspace-recent-show-more" type="button" @click="recentVisibleCount += recentConversationPageSize">显示更多（剩余 {{ filteredConversations.length - visibleRecentConversations.length }} 条）</button>
        </div>
      </section>
      </div>

      <div class="workspace-sidebar__bottom">
        <button v-if="workspaceDataLoaded && auth.isAuthenticated && publicSettings.trialEnabled && !currentSubscription && activeMode !== 'chat'" class="workspace-trial-button" type="button" @click="openSettings('plan')"><Gift :size="17" /><span>免费试用</span></button>
        <button v-if="!auth.isAuthenticated" class="workspace-settings" type="button" title="设置" @click="settingsOpen = true">
          <Settings :size="19" />
          <span>{{ t('workspace.settings') }}</span>
        </button>

        <section v-if="!auth.isAuthenticated && catalog.loginEnabled" class="workspace-signin">
          <strong>获取为你量身定制的回复</strong>
          <p>登录后可保存对话、创建图片并上传文件。</p>
          <RouterLink class="workspace-signin__button" to="/login?redirect=/chat">{{ t('workspace.signIn') }}</RouterLink>
        </section>
        <section v-if="auth.isAuthenticated" class="workspace-account-wrap">
          <button class="workspace-account-button" type="button" :aria-expanded="accountOpen" @click="accountOpen = !accountOpen">
            <span class="workspace-avatar">{{ auth.initials }}</span>
            <span class="workspace-account-copy">
              <strong>{{ auth.displayName }}</strong>
              <small>{{ currentPlanName }}</small>
            </span>
            <ChevronUp :size="16" :class="{ 'is-down': !accountOpen }" />
          </button>
          <div v-if="accountOpen" class="workspace-account-menu">
            <div class="account-menu-heading"><span class="workspace-avatar">{{ auth.initials }}</span><span><strong>{{ auth.displayName }}</strong><small>{{ currentPlanName }}</small></span></div>
            <div class="account-credit"><span>创作点余额</span><strong><Sparkles :size="13" />{{ studio.credits }}</strong></div>
            <button type="button" @click="openUpgrade"><Sparkles :size="16" />{{ currentSubscription ? '查看升级方案' : '升级套餐' }}</button>
            <button type="button" @click="openSettings('teams')"><Users :size="16" />团队空间</button>
            <button type="button" @click="openSettings('support')"><LifeBuoy :size="16" />帮助与客服</button>
            <button type="button" @click="openSettings('personalization')">{{ t('workspace.personalization') }}</button>
            <button type="button" @click="openSettings('account')">{{ t('workspace.account') }}</button>
            <button type="button" @click="openSettings('general')">{{ t('workspace.settings') }}</button>
            <button class="account-logout" type="button" @click="logout"><LogOut :size="17" />{{ t('workspace.logout') }}</button>
          </div>
        </section>
      </div>
    </aside>

    <main ref="workspaceMain" class="workspace-main" :class="{ 'workspace-main--chat': activeMode === 'chat' || activeMode === 'office' }">
      <header class="workspace-mobile-header">
        <button class="icon-button" type="button" aria-label="打开菜单" @click="mobileOpen = true">
          <Menu :size="21" />
        </button>
        <strong v-if="mobileTitle" class="workspace-mobile-title">{{ mobileTitle }}</strong>
      </header>
      <nav v-if="workspaceDataLoaded && auth.isAuthenticated && activeMode === 'chat'" class="workspace-chat-actions" aria-label="对话操作">
        <button v-if="showUpgradeEntry" class="workspace-upgrade-button" type="button" @click="openUpgrade"><Sparkles :size="16" /><span>升级</span></button>
        <button v-if="currentConversation" type="button" aria-label="分享对话" title="分享" :disabled="conversationActionBusy" @click="shareCurrentConversation"><Share2 :size="18" /><span>分享</span></button>
        <div v-if="currentConversation" class="workspace-chat-more-wrap">
          <button type="button" aria-label="更多对话操作" title="更多" :aria-expanded="chatActionsOpen" @click="chatActionsOpen = !chatActionsOpen"><MoreHorizontal :size="20" /></button>
          <div v-if="chatActionsOpen" class="workspace-chat-more-menu" role="menu">
            <button role="menuitem" type="button" @click="toggleCurrentConversationPinned"><PinOff v-if="currentConversation.pinnedAt" :size="17" /><Pin v-else :size="17" />{{ currentConversation.pinnedAt ? '取消置顶' : '置顶聊天' }}</button>
            <button role="menuitem" type="button" @click="archiveCurrentConversation"><Archive :size="17" />归档</button>
            <button class="is-danger" role="menuitem" type="button" @click="deleteCurrentConversation"><Trash2 :size="17" />删除</button>
          </div>
        </div>
      </nav>
      <slot />
    </main>

    <Teleport to="body">
      <div
        v-if="activeConversationMenu"
        ref="conversationMenuElement"
        class="workspace-recent-menu"
        role="menu"
        :aria-label="`打开“${activeConversationMenu.title}”的对话选项`"
        :style="{ left: `${conversationMenuPosition.left}px`, top: `${conversationMenuPosition.top}px` }"
        @click.stop
      >
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="shareConversation(activeConversationMenu)"><Share2 :size="16" />分享</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="startConversationRename(activeConversationMenu)"><Pencil :size="16" />重命名</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="toggleConversationPinned(activeConversationMenu)"><PinOff v-if="activeConversationMenu.pinnedAt" :size="16" /><Pin v-else :size="16" />{{ activeConversationMenu.pinnedAt ? '取消置顶' : '置顶聊天' }}</button>
        <button role="menuitem" type="button" :disabled="conversationActionBusy" @click="archiveConversation(activeConversationMenu.id)"><Archive :size="16" />归档</button>
        <button class="is-danger" role="menuitem" type="button" :disabled="conversationActionBusy" @click="deleteConversation(activeConversationMenu)"><Trash2 :size="16" />删除</button>
      </div>
      <div v-if="settingsOpen" class="studio-modal-backdrop" @click.self="settingsOpen = false">
        <section class="studio-settings-dialog" role="dialog" aria-modal="true" :aria-labelledby="`settings-${settingsSection}`">
          <aside class="settings-sidebar">
            <button class="settings-close" type="button" aria-label="关闭" @click="settingsOpen = false"><X :size="20" /></button>
            <nav ref="settingsNavElement">
              <button v-for="item in settingsNav" :key="item.id" type="button" :data-section="item.id" :class="{ 'is-active': settingsSection === item.id }" @click="selectSettingsSection(item.id)">
                <component :is="item.icon" :size="17" />{{ item.label }}
              </button>
            </nav>
          </aside>
          <main class="settings-content">
            <template v-if="settingsSection === 'general'">
              <h2 id="settings-general">{{ t('settings.general') }}</h2>
              <label class="settings-option-row"><span><strong>{{ t('settings.appearance') }}</strong><small>选择 Xinyue AI 的界面显示方式。</small></span><select v-model="settings.appearance" aria-label="外观"><option value="深色">{{ t('settings.dark') }}</option><option value="浅色">{{ t('settings.light') }}</option><option value="跟随系统">{{ t('settings.system') }}</option></select></label>
              <label class="settings-option-row"><span><strong>{{ t('settings.language') }}</strong><small>设置界面语言。</small></span><select v-model="settings.language" aria-label="语言"><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option></select></label>
            </template>

            <template v-else-if="settingsSection === 'personalization'">
              <h2 id="settings-personalization">{{ t('settings.personalization') }}</h2>
              <label class="settings-option-row"><span><strong>基本风格和语调</strong><small>设置 Xinyue AI 回复你的风格和语调，不会改变功能或执行权限。</small></span><select v-model="settings.style" aria-label="基本风格和语调"><option>默认</option><option>专业</option><option>友好</option><option>直率</option></select></label>
              <label class="settings-option-row"><span><strong>回答详略</strong><small>选择默认的信息密度，本轮明确要求始终优先。</small></span><select v-model="settings.detail" aria-label="回答详略"><option>自动判断</option><option>简洁</option><option>详细</option></select></label>
              <label class="settings-option-row"><span><strong>回复语言</strong><small>设置默认回复语言，也可以继续跟随当前对话。</small></span><select v-model="settings.replyLanguage" aria-label="回复语言"><option>跟随对话</option><option>中文</option><option>English</option></select></label>
              <label class="settings-textarea"><strong>自定义指令</strong><textarea v-model="settings.customInstructions" maxlength="1000" placeholder="例如：先给结论，再说明关键依据；涉及代码时优先给出可执行方案。" /><small>{{ settings.customInstructions.length }}/1000</small></label>
              <section class="settings-about"><h3>关于你</h3><p>这些资料会持续用于个性化回复。请勿填写密码、密钥、证件号或支付账户。</p><label>昵称<input v-model="settings.nickname" placeholder="Xinyue AI 应该怎么称呼你？" /></label><label>职业<input v-model="settings.occupation" placeholder="例如：独立开发者" /></label><label>你的详情<textarea v-model="settings.bio" maxlength="1000" placeholder="需要持续考虑的兴趣、目标、工作方式或背景" /></label><button type="button" @click="saveSettings(true)">保存</button><small v-if="settingsMessage" class="settings-feedback">{{ settingsMessage }}</small></section>
              <section class="settings-memory"><h3>记忆</h3><div><span><strong>使用已保存的记忆</strong><small>让 Xinyue AI 保存并使用你确认过的称呼、习惯和稳定偏好。</small></span><button class="switch-control" :class="{ 'is-on': settings.useMemory }" type="button" role="switch" :aria-checked="settings.useMemory" @click="settings.useMemory = !settings.useMemory"><i /></button></div><div><span><strong>参考过往聊天</strong><small>允许普通聊天在相关时参考其他会话的话题摘要。</small></span><button class="switch-control" :class="{ 'is-on': settings.referenceChats }" type="button" role="switch" :aria-checked="settings.referenceChats" @click="settings.referenceChats = !settings.referenceChats"><i /></button></div></section>
            </template>

            <template v-else-if="settingsSection === 'notifications'">
              <h2 id="settings-notifications">通知</h2><div class="settings-action-row"><span><strong>接收站内通知</strong><small>{{ unreadCount ? `${unreadCount} 条未读通知` : '当前没有未读通知' }}</small></span><button class="switch-control" :class="{ 'is-on': settings.notifications }" type="button" role="switch" :aria-checked="settings.notifications" @click="settings.notifications = !settings.notifications"><i /></button></div><section v-if="notifications.length" class="notification-list"><article v-for="notice in notifications" :key="notice.id" :class="{ 'is-unread': !notice.readAt }"><strong>{{ notice.title || '系统通知' }}</strong><p>{{ notice.body || notice.content || '账户状态已更新' }}</p><time>{{ formatServerDate(notice.createdAt) }}</time></article></section><section v-else class="settings-simple-card"><h3>通知中心</h3><p>暂无通知</p></section><div class="settings-action-row"><span><strong>全部标记为已读</strong><small>清理当前账户的未读提醒状态。</small></span><button type="button" :disabled="!unreadCount" @click="markAllRead">标记已读</button></div>
            </template>
            <template v-else-if="settingsSection === 'data'">
              <h2 id="settings-data">数据控制</h2>
              <section class="settings-data-section">
                <div class="settings-action-row"><span><strong>导出账户数据</strong><small>下载账户资料、设置、项目、文件索引和全部聊天记录的 JSON 副本。</small></span><button type="button" :disabled="dataActionBusy" @click="exportAccountData"><Download :size="15" />导出</button></div>
                <div class="settings-action-row"><span><strong>删除全部聊天</strong><small>永久删除所有聊天和消息。项目与已生成文件不会被删除。</small></span><button class="danger-button" type="button" :disabled="dataActionBusy || !studio.conversations.length" @click="clearConversationHistory"><Trash2 :size="15" />全部删除</button></div>
                <small v-if="dataActionMessage" class="settings-feedback" :class="{ 'is-error': dataActionError }">{{ dataActionMessage }}</small>
              </section>
              <section class="settings-memory"><h3>隐私</h3><div><span><strong>保存聊天记录</strong><small>关闭后新聊天会自动作为临时聊天处理。</small></span><button class="switch-control" :class="{ 'is-on': settings.chatHistoryEnabled }" type="button" role="switch" :aria-checked="settings.chatHistoryEnabled" @click="settings.chatHistoryEnabled = !settings.chatHistoryEnabled"><i /></button></div><div><span><strong>不将内容用于模型训练</strong><small>管理员渠道会收到该隐私偏好，用于后续上游策略适配。</small></span><button class="switch-control" :class="{ 'is-on': settings.trainingOptOut }" type="button" role="switch" :aria-checked="settings.trainingOptOut" @click="settings.trainingOptOut = !settings.trainingOptOut"><i /></button></div><div><span><strong>默认使用临时聊天</strong><small>新聊天不显示在历史记录中并自动过期。</small></span><button class="switch-control" :class="{ 'is-on': settings.temporaryChatDefault }" type="button" role="switch" :aria-checked="settings.temporaryChatDefault" @click="settings.temporaryChatDefault = !settings.temporaryChatDefault"><i /></button></div><div><span><strong>共享匿名使用分析</strong><small>仅用于产品稳定性和功能使用统计。</small></span><button class="switch-control" :class="{ 'is-on': settings.shareUsageAnalytics }" type="button" role="switch" :aria-checked="settings.shareUsageAnalytics" @click="settings.shareUsageAnalytics = !settings.shareUsageAnalytics"><i /></button></div><label class="settings-option-row"><span><strong>聊天数据保留</strong><small>超过期限的普通聊天会自动永久删除。</small></span><select v-model.number="settings.dataRetentionDays"><option :value="0">永久保留</option><option :value="30">30 天</option><option :value="90">90 天</option><option :value="365">1 年</option></select></label></section>
              <section class="settings-moderation-cases">
                <header><div><h3>内容审核与申诉</h3><p>查看被安全策略拦截的内容。认为判断有误时，可提交一次人工复核。</p></div><span>{{ moderationCases.length }} 条记录</span></header>
                <article v-for="item in moderationCases" :key="item.id">
                  <div class="moderation-case-heading"><span><strong>{{ moderationSourceText[item.source] || item.source }}</strong><small>{{ formatServerDate(item.createdAt) }}</small></span><em :class="`status-${(item.appeal?.status || item.status).toLowerCase()}`">{{ moderationCaseStatus(item) }}</em></div>
                  <p>{{ item.contentExcerpt }}</p>
                  <template v-if="!item.appeal && item.status === 'OPEN'">
                    <textarea v-model.trim="appealDrafts[item.id]" maxlength="1000" placeholder="说明内容用途、上下文和申请复核的理由（至少 10 个字）" />
                    <footer><small>{{ (appealDrafts[item.id] || '').length }}/1000</small><button type="button" :disabled="appealBusyId === item.id || (appealDrafts[item.id] || '').trim().length < 10" @click="submitModerationAppeal(item)">{{ appealBusyId === item.id ? '提交中' : '提交申诉' }}</button></footer>
                  </template>
                  <template v-else-if="item.appeal">
                    <div class="moderation-appeal-copy"><strong>申诉理由</strong><p>{{ item.appeal.reason }}</p><template v-if="item.appeal.reviewNote"><strong>复核说明</strong><p>{{ item.appeal.reviewNote }}</p></template></div>
                    <footer v-if="item.appeal.status === 'PENDING'"><small>管理员开始复核前可以撤回。</small><button class="danger-button" type="button" :disabled="appealBusyId === item.id" @click="cancelModerationAppeal(item)">撤回申诉</button></footer>
                  </template>
                </article>
                <p v-if="!moderationCases.length" class="settings-empty-copy">当前账户没有内容审核记录。</p>
                <small v-if="appealMessage" class="settings-feedback" :class="{ 'is-error': appealError }">{{ appealMessage }}</small>
              </section>
              <section class="settings-empty-section"><h3>共享链接</h3><p>管理你主动公开的对话副本。删除后，原链接会立即失效。</p><strong>你还没有创建公开对话链接。</strong></section>
            </template>
            <template v-else-if="settingsSection === 'plan'">
              <h2 id="settings-plan">套餐与账单</h2><section v-if="currentSubscription" class="settings-current-plan"><div><span>{{ currentSubscription.status === 'TRIALING' ? '试用中' : '当前套餐' }}</span><h3>{{ currentSubscription.plan.name }}</h3><p>{{ subscriptionEndText }}</p></div><strong>{{ currentSubscription.plan.includedCredits }}<small>创作点 / 周期</small></strong></section><div v-if="currentSubscription && !currentSubscription.cancelAtPeriodEnd" class="settings-action-row"><span><strong>取消自动续订</strong><small>付费套餐将在当前周期结束后停止，试用套餐会立即结束。</small></span><button type="button" :disabled="planBusy" @click="cancelSubscription">取消套餐</button></div><section v-if="!currentSubscription" class="settings-empty-section"><h3>免费版</h3><p>升级套餐可获得周期额度、更高并发和更多创作能力。</p><button v-if="publicSettings.trialEnabled" type="button" :disabled="planBusy" @click="startTrial()">{{ planBusy ? '处理中' : '开始免费试用' }}</button></section>
              <section class="settings-plan-grid"><article v-for="plan in subscriptionPlans" :key="plan.id" :class="{ recommended: plan.recommended }"><header><strong>{{ plan.name }}</strong><em v-if="plan.promotion">{{ plan.promotion.label || '限时优惠' }}</em><em v-else-if="plan.recommended">推荐</em></header><h3><del v-if="plan.effectivePriceCents !== undefined && plan.effectivePriceCents < plan.priceCents">{{ formatMoney(plan.priceCents) }}</del>{{ formatMoney(plan.effectivePriceCents ?? plan.priceCents) }}<small>/ {{ plan.billingCycle === 'YEARLY' ? '年' : plan.billingCycle === 'ONE_TIME' ? '一次性' : '月' }}</small></h3><p>{{ plan.description }}</p><ul><li v-if="plan.promotion">{{ plan.promotion.name }} · {{ formatServerDate(plan.promotion.endsAt) }}结束</li><li>{{ plan.includedCredits }} 创作点</li><li>{{ plan.concurrency }} 路并发</li><li>{{ [plan.imageAccess && '图片', plan.videoAccess && '视频', plan.commerceAccess && '商品视觉'].filter(Boolean).join('、') || '对话' }}能力</li><li>{{ plan.allowByok ? '支持个人 API 密钥' : '管理员统一渠道' }}</li><li v-if="plan.trialDays">{{ plan.trialDays }} 天免费试用</li></ul><button type="button" :disabled="planBusy || currentSubscription?.planId === plan.id || (!currentSubscription && !plan.priceCents && !plan.trialDays) || (plan.priceCents > 0 && !publicSettings.subscriptionsEnabled)" @click="purchasePlan(plan)">{{ currentSubscription?.planId === plan.id ? '当前套餐' : !plan.priceCents && !plan.trialDays ? '当前免费方案' : plan.priceCents && !publicSettings.subscriptionsEnabled ? '暂未开放' : plan.priceCents ? '选择套餐' : '免费试用' }}</button></article></section>
              <section v-if="couponWallet.templates.length || couponWallet.coupons.length" class="settings-coupon-wallet"><header><div><h3>我的优惠券</h3><p>结算时可选择适用优惠券，系统会按活动叠加规则重新报价。</p></div><span>{{ couponWallet.coupons.filter((item) => item.status === 'AVAILABLE').length }} 张可用</span></header><div class="settings-coupon-list"><article v-for="coupon in couponWallet.coupons" :key="coupon.id" :class="`status-${coupon.status.toLowerCase()}`"><strong>{{ coupon.template.name }}</strong><span>{{ coupon.template.discountType === 'FIXED' ? `立减 ${formatMoney(coupon.template.discountValue)}` : `优惠 ${coupon.template.discountValue / 100}%` }}</span><small>{{ coupon.status === 'AVAILABLE' ? `${coupon.expiresAt ? formatServerDate(coupon.expiresAt) : '长期'}前可用` : coupon.status === 'LOCKED' ? '订单占用中' : coupon.status === 'REDEEMED' ? '已使用' : '已失效' }}</small></article><button v-for="template in couponWallet.templates" :key="template.id" type="button" :disabled="couponBusyId === template.id" @click="claimCoupon(template)"><strong>{{ template.name }}</strong><span>{{ template.discountType === 'FIXED' ? `立减 ${formatMoney(template.discountValue)}` : `优惠 ${template.discountValue / 100}%` }}</span><small>{{ couponBusyId === template.id ? '领取中' : '立即领取' }}</small></button></div></section>
              <small v-if="planMessage" class="settings-feedback" :class="{ 'is-error': planError }">{{ planMessage }}</small><section v-if="subscriptionOrders.length" class="settings-history"><h3>套餐订单</h3><div v-for="order in subscriptionOrders" :key="order.id"><span>{{ order.plan.name }}<small>{{ formatServerDate(order.createdAt) }} · {{ rechargeStatusText[order.status] || order.status }}</small></span><strong><template v-if="order.status === 'PENDING'"><button type="button" @click="continueSubscriptionPayment(order)">继续支付</button><button type="button" class="danger-button" @click="cancelPendingSubscriptionOrder(order)">取消</button></template><template v-else>{{ formatMoney(order.amountCents) }}</template></strong></div></section>
              <section v-if="currentSubscription && currentSubscription.plan.priceCents > 0 && currentSubscription.plan.billingCycle !== 'ONE_TIME'" class="settings-billing-section"><header><div><h3>续费设置</h3><p>到期前 3 天自动创建续费订单并通知；支付完成后延长当前周期，不会在没有支付授权时自动扣款。</p></div></header><label class="settings-option-row"><span><strong>到期续费提醒</strong><small>{{ currentSubscription.autoRenewEnabled ? '已启用' : '未启用' }}</small></span><button class="switch-control" :class="{ 'is-on': currentSubscription.autoRenewEnabled }" type="button" role="switch" :aria-checked="currentSubscription.autoRenewEnabled" :disabled="planBusy" @click="toggleRenewal"><i /></button></label><label v-if="renewalOptions?.channels.length" class="settings-option-row"><span><strong>续费支付渠道</strong><small>订单创建后仍需由你确认付款。</small></span><select v-model="selectedRenewalChannelId" :disabled="!currentSubscription.autoRenewEnabled" @change="saveRenewalChannel"><option v-for="channel in renewalOptions.channels" :key="channel.id" :value="channel.id">{{ channel.name }}</option></select></label><section v-if="renewalAttempts.length" class="settings-history compact"><h3>续费记录</h3><div v-for="item in renewalAttempts.slice(0, 5)" :key="item.id"><span>第 {{ item.attemptNumber }} 次续费<small>{{ formatServerDate(item.createdAt) }} · {{ renewalAttemptText[item.status] || item.status }}</small></span><strong>{{ item.failureReason || (item.orderId ? '订单已创建' : '') }}</strong></div></section></section>
              <section class="settings-billing-section"><header><div><h3>开票资料</h3><p>企业发票需要完整纳税人信息。发票申请会保存当时的资料快照。</p></div></header><div class="settings-billing-form"><label>抬头类型<select v-model="billingProfile.profileType"><option value="COMPANY">企业</option><option value="PERSONAL">个人</option></select></label><label>发票抬头<input v-model.trim="billingProfile.title" maxlength="200" /></label><label v-if="billingProfile.profileType === 'COMPANY'">纳税人识别号<input v-model.trim="billingProfile.taxId" maxlength="100" /></label><label>接收邮箱<input v-model.trim="billingProfile.invoiceEmail" type="email" maxlength="320" /></label><label>联系电话<input v-model.trim="billingProfile.phone" maxlength="50" /></label><label class="wide">注册地址<input v-model.trim="billingProfile.address" maxlength="1000" /></label><label>开户银行<input v-model.trim="billingProfile.bankName" maxlength="200" /></label><label>银行账号<input v-model.trim="billingProfile.bankAccount" maxlength="200" /></label></div><button class="settings-primary-action" type="button" :disabled="billingBusy" @click="saveBillingProfile">保存开票资料</button><div v-if="invoiceTransactions.length" class="settings-invoice-request"><select v-model="selectedInvoiceTransactionId"><option value="">选择可开票交易</option><option v-for="item in invoiceTransactions" :key="item.id" :value="item.id">{{ item.outTradeNo }} · {{ formatMoney(item.amountCents) }}</option></select><button type="button" :disabled="billingBusy || !selectedInvoiceTransactionId" @click="requestInvoice">申请电子发票</button></div><section v-if="invoiceRequests.length" class="settings-history compact"><h3>发票记录</h3><div v-for="item in invoiceRequests" :key="item.id"><span>{{ item.transaction.outTradeNo }}<small>{{ formatServerDate(item.requestedAt) }} · {{ invoiceStatusText[item.status] || item.status }}</small></span><strong><a v-if="item.status === 'ISSUED' && item.invoiceUrl" :href="item.invoiceUrl" target="_blank" rel="noopener">下载发票</a><button v-else-if="['REQUESTED','REVIEWING'].includes(item.status)" type="button" @click="cancelInvoiceRequest(item)">撤销</button><template v-else>{{ item.rejectionReason }}</template></strong></div></section><small v-if="billingMessage" class="settings-feedback">{{ billingMessage }}</small></section>
            </template>
            <template v-else-if="settingsSection === 'api'">
              <h2 id="settings-api">API 与模型</h2>
              <section v-if="!publicSettings.userByokEnabled" class="settings-empty-section"><h3>用户 API 密钥未开放</h3><p>当前工作区统一使用管理员配置的模型渠道。</p></section>
              <template v-else>
                <section class="settings-routing-overview">
                  <header><div><strong>模型路由</strong><small>管理员渠道优先，失败时可切换到你启用的个人密钥。</small></div><span>{{ availableModels.length }} 个模型</span></header>
                  <div class="settings-routing-grid">
                    <article><span><ServerCog :size="18" /></span><div><strong>平台模型渠道</strong><small>{{ availableModels.length ? `${availableModels.length} 个可用模型，支持自动路由与故障切换` : '管理员暂未发布可用模型' }}</small></div><em :class="{ inactive: !availableModels.length }">{{ availableModels.length ? '可用' : '待配置' }}</em></article>
                    <article><span><KeyRound :size="18" /></span><div><strong>个人 API 密钥</strong><small>{{ apiCredentials.length ? `${apiCredentials.filter((item) => item.enabled).length} 个已启用，任务可按策略使用` : '添加 NewAPI、Sub2API 或 OpenAI 兼容密钥' }}</small></div><em :class="{ inactive: !apiCredentials.some((item) => item.enabled) }">{{ apiCredentials.some((item) => item.enabled) ? '已接入' : '未接入' }}</em></article>
                  </div>
                  <div v-if="availableModels.length" class="settings-model-tags"><span v-for="item in availableModels.slice(0, 8)" :key="item.key">{{ item.displayName }}<small>{{ modelCapabilityLabel[item.capability] || item.capability }}</small></span><em v-if="availableModels.length > 8">+{{ availableModels.length - 8 }}</em></div>
                </section>
                <div class="settings-action-row"><span><strong>我的上游密钥</strong><small>密钥加密保存，可分别启用、停用并设置默认项。</small></span><button type="button" @click="openCredentialEditor()"><CirclePlus :size="15" />添加密钥</button></div>
                <section class="settings-api-list"><article v-for="item in apiCredentials" :key="item.id"><div><strong>{{ item.name }}<em v-if="item.isDefault">默认</em></strong><small>{{ providerTypeLabel[item.providerType] }} · {{ item.apiKeyHint }} · {{ item.totalRequests || 0 }} 次调用<span v-if="item.expiresAt"> · {{ formatServerDate(item.expiresAt) }} 到期</span></small><p>{{ item.baseUrl }}</p></div><span class="settings-api-state" :class="{ disabled: !item.enabled || item.lastHealthStatus === 'unhealthy' }">{{ item.lastHealthStatus === 'healthy' ? '连接正常' : item.lastHealthStatus === 'unhealthy' ? '连接异常' : item.enabled ? '待检测' : '已停用' }}</span><footer><button type="button" :disabled="credentialCheckingId === item.id" @click="discoverCredential(item)">{{ credentialCheckingId === item.id ? '检测中' : '检测并导入模型' }}</button><button type="button" @click="openCredentialEditor(item)">编辑/轮换</button><button type="button" class="danger-button" @click="deleteCredential(item)">删除</button></footer></article><p v-if="!apiCredentials.length">尚未添加个人 API 密钥，生成任务会使用管理员渠道。</p></section>
                <div class="settings-action-row"><span><strong>我的模型</strong><small>一个模型可以绑定多个密钥，并按优先级、权重或轮询策略切换。</small></span><button type="button" :disabled="!apiCredentials.length" @click="openPrivateModelEditor()"><CirclePlus :size="15" />添加模型</button></div>
                <section class="settings-api-list settings-private-models"><article v-for="item in privateModels" :key="item.id"><div><strong>{{ item.displayName }}<em v-if="item.isDefault">默认</em></strong><small>{{ modelCapabilityLabel[item.capability] }} · {{ routingStrategyLabel[item.routingStrategy] || item.routingStrategy }}</small><p>{{ item.routes.length }} 条密钥路由 · {{ item.routes.filter((route) => route.enabled && route.credential.enabled).length }} 条已启用</p></div><span class="settings-api-state" :class="{ disabled: !item.enabled || !item.routes.some((route) => route.enabled && route.credential.enabled) }">{{ item.enabled ? '已启用' : '已停用' }}</span><footer><button type="button" @click="openPrivateModelEditor(item)">编辑路由</button><button type="button" class="danger-button" @click="deletePrivateModel(item)">删除</button></footer></article><p v-if="!privateModels.length">尚未配置私有模型。检测密钥后可直接导入上游模型。</p></section>
              </template>
            </template>
            <template v-else-if="settingsSection === 'credits'">
              <h2 id="settings-credits">创作点</h2><section class="settings-credit-card"><p>创作点余额</p><small>所有图片和商品视觉创作统一从当前余额扣点。</small><strong>{{ studio.credits }} 创作点</strong></section><template v-if="publicSettings.rechargeEnabled"><div class="settings-action-row"><span><strong>充值套餐</strong><small>创建订单后按页面提示完成付款</small></span></div><section class="settings-recharge-grid"><button v-for="item in rechargePackages" :key="item.id" type="button" :disabled="creatingOrder" @click="createRechargeOrder(item)"><span><strong>{{ item.name }}</strong><small>{{ item.credits }} 创作点</small></span><b>{{ formatMoney(item.priceCents) }}</b><em v-if="item.recommended">推荐</em></button></section><small v-if="rechargeMessage" class="settings-feedback">{{ rechargeMessage }}</small><section v-if="rechargeOrders.length" class="settings-history"><h3>充值订单</h3><div v-for="order in rechargeOrders" :key="order.id"><span>{{ order.package?.name || '充值订单' }}<small>{{ formatServerDate(order.createdAt) }} · {{ rechargeStatusText[order.status] || order.status }}</small></span><strong>{{ formatMoney(order.amountCents) }}</strong></div></section></template><div v-else class="settings-action-row"><span><strong>补充方式</strong><small>当前可使用兑换码，充值入口由管理员控制</small></span></div><section class="settings-history"><h3>创作点记录</h3><div v-for="entry in creditLedger" :key="entry.id"><span>{{ entry.description }}<small>{{ formatServerDate(entry.createdAt) }}</small></span><strong :class="{ 'is-negative': entry.amount < 0 }">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }} 点</strong></div><p v-if="!creditLedger.length">暂无创作点记录</p></section>
            </template>
            <template v-else-if="settingsSection === 'redeem'">
              <h2 id="settings-redeem">兑换码</h2><section class="settings-empty-section"><h3>兑换创作点</h3><p>输入有效兑换码，将创作点添加到当前账户。</p><label class="redeem-field">兑换码<input v-model="settings.redeemCode" placeholder="请输入兑换码" @keydown.enter.prevent="redeemCredits" /></label><button type="button" :disabled="!settings.redeemCode.trim() || redeeming" @click="redeemCredits">{{ redeeming ? '兑换中' : '兑换' }}</button><small v-if="redeemMessage" class="settings-feedback" :class="{ 'is-error': redeemError }">{{ redeemMessage }}</small></section>
            </template>
            <template v-else-if="settingsSection === 'invite'">
              <h2 id="settings-invite">邀请与奖励</h2><section class="settings-invite-grid"><div><span>已邀请用户</span><strong>{{ inviteInfo.invited }}</strong><small>通过你的邀请链接注册的用户数量。</small></div><div><span>累计奖励</span><strong>{{ inviteInfo.reward }} 创作点</strong><small>已完成冷静期并计入账户的奖励。</small></div><div><span>待发放</span><strong>{{ inviteInfo.pending }}</strong><small>正在冷静期或已审核通过的邀请。</small></div><div><span>审核中</span><strong>{{ inviteInfo.reviewRequired }}</strong><small>需要管理员核验的邀请记录。</small></div></section><label class="invite-link"><span>邀请链接</span><div><input readonly :value="inviteInfo.url" /><button type="button" :disabled="!inviteInfo.url" @click="copyInvite">{{ inviteCopied ? '已复制' : '复制' }}</button></div></label><section class="settings-empty-section"><h3>邀请码</h3><p>{{ inviteInfo.code || '登录后生成专属邀请码' }}</p></section>
            </template>
            <template v-else-if="settingsSection === 'workspace'">
              <h2 id="settings-workspace">知识与工具</h2>
              <p class="settings-section-intro">管理助手可检索的资料，以及需要管理员审批的外部工具权限。</p>
              <section class="settings-workspace-section">
                <header><div><strong>我的知识库</strong><small>文本和 JSON 文件会自动提取内容，图片等文件保留为资料索引。</small></div><BookOpen :size="19" /></header>
                <form class="settings-knowledge-create" @submit.prevent="createKnowledgeBase"><input v-model.trim="knowledgeDraft.name" required maxlength="100" placeholder="知识库名称" /><input v-model.trim="knowledgeDraft.description" maxlength="2000" placeholder="用途说明（可选）" /><select v-model="knowledgeDraft.teamId" aria-label="知识库归属"><option value="">个人知识库</option><option v-for="team in manageableTeams" :key="team.id" :value="team.id">{{ team.name }}</option></select><button type="submit" :disabled="workspaceBusy"><CirclePlus :size="15" />创建</button></form>
                <div class="settings-knowledge-list">
                  <article v-for="item in knowledgeBases" :key="item.id">
                    <header><div><strong>{{ item.name }}</strong><small>{{ item.description || '暂无说明' }} · {{ item.team?.name || '个人知识库' }}</small></div><span>{{ item.documentCount }} 个文件 · {{ item.chunkCount }} 个分块</span></header>
                    <div v-if="item.assets.length" class="settings-knowledge-assets"><div v-for="entry in item.assets" :key="entry.assetId"><span><FileText :size="15" />{{ entry.asset.name }}</span><button type="button" aria-label="从知识库移除文件" @click="detachKnowledgeAsset(item.id, entry.assetId)"><X :size="14" /></button></div></div>
                    <p v-else>还没有关联文件。</p>
                    <footer><select :value="knowledgeAssetSelection[item.id] || ''" :aria-label="`为${item.name}选择文件`" @change="knowledgeAssetSelection[item.id] = ($event.target as HTMLSelectElement).value"><option value="">选择已上传文件</option><option v-for="asset in availableKnowledgeAssets(item)" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select><button type="button" :disabled="!knowledgeAssetSelection[item.id] || workspaceBusy" @click="attachKnowledgeAsset(item.id)">添加文件</button><select v-if="item.creator?.id === auth.session?.id || manageableTeams.some((team) => team.id === item.teamId)" v-model="knowledgeTeamSelection[item.id]" :aria-label="`${item.name}归属`"><option value="">个人</option><option v-for="team in manageableTeams" :key="team.id" :value="team.id">{{ team.name }}</option></select><button v-if="item.creator?.id === auth.session?.id || manageableTeams.some((team) => team.id === item.teamId)" type="button" :disabled="workspaceBusy || knowledgeTeamSelection[item.id] === (item.teamId || '')" @click="assignKnowledgeBaseTeam(item)">调整归属</button><button type="button" @click="editKnowledgeBase(item)"><Pencil :size="14" />编辑</button><button class="danger-button" type="button" @click="deleteKnowledgeBase(item)"><Trash2 :size="14" />删除</button></footer>
                  </article>
                  <p v-if="!knowledgeBases.length" class="settings-empty-copy">尚未创建知识库。创建后可绑定资料并在后台关联到 AI 助手。</p>
                </div>
              </section>
              <section class="settings-workspace-section">
                <header><div><strong>工具权限</strong><small>需要审批的工具会生成正式申请，批准后在有效期内可调用一次。</small></div><Wrench :size="19" /></header>
                <div class="settings-tool-list"><article v-for="binding in assistantToolBindings" :key="binding.key"><div><strong>{{ binding.tool.name }}</strong><small>{{ binding.assistant.name }} · {{ binding.tool.description || binding.tool.key }}</small></div><span :class="`status-${binding.approval?.status?.toLowerCase() || 'none'}`">{{ toolApprovalText(binding) }}</span><button v-if="binding.tool.requiresApproval && !['PENDING', 'APPROVED'].includes(binding.approval?.status || '')" type="button" :disabled="workspaceBusy" @click="requestToolApproval(binding)">申请权限</button><button v-else-if="binding.tool.requiresApproval && binding.approval?.status === 'PENDING'" class="subtle-button" type="button" :disabled="workspaceBusy" @click="cancelToolApproval(binding)">撤回申请</button><em v-else-if="!binding.tool.requiresApproval">无需审批</em></article><p v-if="!assistantToolBindings.length" class="settings-empty-copy">管理员启用并绑定工具后会显示在这里。</p></div>
              </section>
              <small v-if="workspaceMessage" class="settings-feedback" :class="{ 'is-error': workspaceError }">{{ workspaceMessage }}</small>
            </template>
            <template v-else-if="settingsSection === 'teams'">
              <h2 id="settings-teams">团队空间</h2><p class="settings-section-intro">创建团队、分配成员角色并管理协作空间。</p>
              <section v-if="pendingTeamInvitations.length" class="settings-team-builder">
                <header><div><strong>待处理邀请</strong><small>只有受邀邮箱对应的账户可以接受邀请。</small></div><Users :size="19" /></header>
                <div class="settings-team-members"><div v-for="invite in pendingTeamInvitations" :key="invite.id"><span>{{ invite.team.name }}<small>{{ invite.team.owner.displayName }} 邀请你成为{{ teamRoleText[invite.role] || invite.role }} · {{ formatInvitationExpiry(invite.expiresAt) }}</small></span><div><button type="button" :disabled="teamBusy" @click="acceptTeamInvitation(invite.id)">接受</button></div></div></div>
              </section>
              <section class="settings-team-builder"><header><div><strong>创建团队</strong><small>团队创建后，你将成为所有者；默认包含 5 个席位。</small></div><Users :size="19" /></header><form class="settings-team-create" @submit.prevent="createTeam"><label><span>团队名称</span><input v-model.trim="teamDraft.name" required maxlength="100" placeholder="例如：品牌设计团队" /></label><label><span>团队说明</span><input v-model.trim="teamDraft.description" maxlength="2000" placeholder="团队目标或用途（可选）" /></label><button type="submit" :disabled="teamBusy"><LoaderCircle v-if="teamBusy" class="settings-payment-spin" :size="15" />{{ teamBusy ? '创建中' : '创建团队' }}</button></form></section>
              <section v-for="team in teams" :key="team.id" class="settings-team-card">
                <header><div><strong>{{ team.name }}</strong><small>{{ team.description || team.slug }} · {{ team.members.length }}/{{ team.seatLimit }} 席</small></div><div class="settings-team-actions"><button v-if="team.ownerId === auth.session?.id" type="button" @click="editTeam(team)"><Pencil :size="14" />编辑</button><button v-if="team.ownerId === auth.session?.id" type="button" @click="teamInviteId = team.id">邀请成员</button><button v-else type="button" @click="leaveTeam(team)"><LogOut :size="14" />退出</button></div></header>
                <button class="settings-team-resource-summary" type="button" :aria-expanded="expandedTeamId === team.id" @click="toggleTeamResources(team.id)"><span><strong>{{ team._count?.projects || 0 }}</strong><small>项目</small></span><span><strong>{{ team._count?.assets || 0 }}</strong><small>文件</small></span><span><strong>{{ team._count?.knowledgeBases || 0 }}</strong><small>知识库</small></span><em>{{ expandedTeamId === team.id ? '收起' : '查看共享资源' }}</em></button>
                <div class="settings-team-billing"><div><span><strong>{{ team.creditAccount?.balance || 0 }}</strong><small>团队创作点</small></span><span><strong>{{ currentTeamMember(team)?.creditsUsed || 0 }}</strong><small>我的本月用量{{ currentTeamMember(team)?.monthlyCreditLimit === null ? ' · 不限额' : ` / ${currentTeamMember(team)?.monthlyCreditLimit || 0}` }}</small></span><span><strong>{{ team.billingEnabled ? '已启用' : '未启用' }}</strong><small>团队项目共享支付</small></span></div><nav><button v-if="team.ownerId === auth.session?.id" type="button" :disabled="teamBusy" @click="toggleTeamBilling(team)">{{ team.billingEnabled ? '停用共享支付' : '启用共享支付' }}</button><button type="button" @click="toggleTeamLedger(team.id)">{{ teamLedgerOpenId === team.id ? '收起流水' : '额度流水' }}</button></nav></div>
                <div v-if="teamLedgerOpenId === team.id" class="settings-team-ledger"><div v-for="entry in teamCreditLedgers[team.id] || []" :key="entry.id"><span>{{ entry.description }}<small>{{ entry.user?.displayName || '系统' }} · {{ formatServerDate(entry.createdAt) }}</small></span><strong :class="{ 'is-negative': entry.amount < 0 }">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }}</strong></div><p v-if="!(teamCreditLedgers[team.id]?.length)">暂无团队额度记录</p></div>
                <div v-if="expandedTeamId === team.id" class="settings-team-resources"><template v-if="teamResources[team.id]"><section><strong>项目</strong><span v-for="item in teamResources[team.id]?.projects" :key="item.id">{{ item.name }}<small>{{ item._count.conversations }} 个对话 · {{ item._count.assets }} 个文件</small></span><p v-if="!teamResources[team.id]?.projects.length">暂无团队项目</p></section><section><strong>文件</strong><span v-for="item in teamResources[team.id]?.assets.slice(0, 8)" :key="item.id">{{ item.name }}<small>{{ item.kind }}</small></span><p v-if="!teamResources[team.id]?.assets.length">暂无团队文件</p></section><section><strong>知识库</strong><span v-for="item in teamResources[team.id]?.knowledgeBases" :key="item.id">{{ item.name }}<small>{{ item.documentCount }} 个文件</small></span><p v-if="!teamResources[team.id]?.knowledgeBases.length">暂无团队知识库</p></section></template><LoaderCircle v-else class="settings-payment-spin" :size="18" /></div>
                <div class="settings-team-members"><div v-for="member in team.members" :key="member.userId"><span>{{ member.user.displayName }}<small>{{ member.user.email || '未绑定邮箱' }} · {{ teamRoleText[member.role] || member.role }} · 本月已用 {{ member.creditsUsed }} 点</small></span><div v-if="isTeamManager(team)" class="settings-team-member-controls"><label><span>月限额</span><input v-model="teamQuotaDrafts[`${team.id}:${member.userId}`]" type="number" min="0" max="100000000" placeholder="不限" /></label><button type="button" :disabled="teamBusy" @click="saveTeamMemberQuota(team, member)">保存限额</button><template v-if="member.role !== 'OWNER' && team.ownerId === auth.session?.id"><button type="button" @click="transferTeamOwnership(team, member)">转让</button><select :value="member.role" :aria-label="`设置${member.user.displayName}的角色`" @change="updateTeamMemberRole(team.id, member.userId, ($event.target as HTMLSelectElement).value)"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><button type="button" aria-label="移除成员" @click="removeTeamMember(team.id, member.userId)"><Trash2 :size="14" /></button></template></div></div></div>
                <div v-if="team.invitations.length" class="settings-team-members"><div v-for="invite in team.invitations" :key="invite.id"><span>{{ invite.email }}<small>等待接受 · {{ teamRoleText[invite.role] || invite.role }} · {{ formatInvitationExpiry(invite.expiresAt) }}</small></span><div v-if="team.ownerId === auth.session?.id"><button type="button" @click="cancelTeamInvitation(team.id, invite.id)">取消邀请</button></div></div></div>
                <form v-if="teamInviteId === team.id" class="settings-team-invite" @submit.prevent="inviteToTeam(team.id)"><input v-model.trim="teamInviteEmail" required type="email" placeholder="成员邮箱，可邀请尚未注册的用户" /><select v-model="teamInviteRole" aria-label="成员角色"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><button type="submit" :disabled="teamBusy">发送邀请</button><button type="button" @click="teamInviteId = ''">取消</button></form>
                <footer v-if="team.ownerId === auth.session?.id"><button class="danger-button" type="button" @click="deleteTeam(team)"><Trash2 :size="14" />删除团队</button></footer>
              </section><p v-if="!teams.length" class="settings-empty-copy">你还没有加入团队空间。</p><small v-if="teamMessage" class="settings-feedback" :class="{ 'is-error': teamError }">{{ teamMessage }}</small>
            </template>
            <SupportCenter v-else-if="settingsSection === 'support'" />
            <template v-else>
              <h2 id="settings-account">账户</h2><div class="account-detail-row"><span>姓名</span><strong>{{ auth.displayName }}</strong></div><div class="account-detail-row"><span>{{ accountIdentityLabel }}<small>{{ accountIdentityHint }}</small></span><strong>{{ accountIdentity }}</strong></div><div class="account-detail-row"><span>登录方式</span><strong>{{ loginMethodLabel }}</strong></div><h3 class="account-actions-title">Xinyue AI</h3><nav class="settings-legal-links"><RouterLink to="/about" @click="settingsOpen = false">关于我们</RouterLink><RouterLink to="/copyright" @click="settingsOpen = false">版权说明</RouterLink><RouterLink to="/terms" @click="settingsOpen = false">用户协议</RouterLink><RouterLink to="/privacy" @click="settingsOpen = false">隐私政策</RouterLink></nav><h3 class="account-actions-title">账户操作</h3><div class="settings-action-row"><span><strong>退出登录</strong><small>结束当前设备上的登录状态。</small></span><button class="danger-button" type="button" @click="logout">退出登录</button></div><section class="settings-account-deletion"><template v-if="accountDeletion"><h3>账户注销{{ accountDeletion.status === 'FAILED' ? '处理失败' : '冷静期中' }}</h3><p v-if="accountDeletion.status === 'REQUESTED'">计划在 {{ new Date(accountDeletion.scheduledAt).toLocaleString('zh-CN') }} 清除个人数据。冷静期内可以撤销。</p><p v-else>{{ accountDeletion.failureReason || '注销流程正在处理。' }}</p><button v-if="accountDeletion.status === 'REQUESTED'" type="button" :disabled="deletionBusy" @click="cancelAccountDeletion">撤销注销申请</button></template><template v-else><h3>注销账户</h3><p>提交后有 7 天冷静期。到期将清除登录凭据、个人密钥、连接器和个人内容；支付、发票和审计记录会匿名保留。</p><textarea v-model.trim="deletionReason" maxlength="2000" placeholder="注销原因（可选）" /><button class="danger-button" type="button" :disabled="deletionBusy" @click="requestAccountDeletion">申请注销账户</button></template><small v-if="deletionMessage" class="settings-feedback">{{ deletionMessage }}</small></section>
            </template>
          </main>
        </section>
      </div>
        <div v-if="upgradeOpen" class="workspace-upgrade-layer" @mousedown.self="upgradeOpen = false">
          <section class="workspace-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-upgrade-title">
            <button class="workspace-upgrade-close" type="button" aria-label="关闭升级套餐" @click="upgradeOpen = false"><X :size="21" /></button>
            <header><h2 id="workspace-upgrade-title">升级套餐</h2><p>选择适合你的使用方式</p></header>
            <div class="workspace-upgrade-tabs" role="tablist"><button type="button" :class="{ active: pricingMode === 'personal' }" @click="pricingMode = 'personal'">个人</button><button type="button" :class="{ active: pricingMode === 'team' }" @click="pricingMode = 'team'">团队</button></div>
            <div v-if="pricingMode === 'personal'" class="workspace-upgrade-plans">
              <article class="workspace-upgrade-plan workspace-upgrade-plan--free"><header><strong>免费版</strong><small>开始使用 Xinyue AI</small></header><h3>{{ formatMoney(0) }}<small>/ 月</small></h3><button type="button" disabled>{{ currentSubscription ? '基础方案' : '当前套餐' }}</button><ul><li><CheckCircle2 :size="17" />基础模型和日常对话</li><li><CheckCircle2 :size="17" />有限额度的图片生成</li><li><CheckCircle2 :size="17" />项目与文件管理</li></ul></article>
              <article v-for="plan in upgradeSubscriptionPlans" :key="plan.id" class="workspace-upgrade-plan" :class="{ recommended: plan.recommended, current: currentSubscription?.planId === plan.id }"><header><strong>{{ plan.name }}</strong><em v-if="plan.promotion">{{ plan.promotion.label || '限时优惠' }}</em><em v-else-if="plan.recommended">推荐</em><small>{{ plan.description }}</small></header><h3><del v-if="plan.effectivePriceCents !== undefined && plan.effectivePriceCents < plan.priceCents">{{ formatMoney(plan.priceCents) }}</del>{{ formatMoney(plan.effectivePriceCents ?? plan.priceCents) }}<small>/ {{ plan.billingCycle === 'YEARLY' ? '年' : plan.billingCycle === 'ONE_TIME' ? '一次性' : '月' }}</small></h3><button type="button" :disabled="planBusy || currentSubscription?.planId === plan.id || (plan.priceCents > 0 && !publicSettings.subscriptionsEnabled)" @click="purchaseUpgradePlan(plan)">{{ currentSubscription?.planId === plan.id ? '当前套餐' : plan.priceCents ? `升级至 ${plan.name}` : '开始免费试用' }}</button><ul><li v-if="plan.promotion"><CheckCircle2 :size="17" />{{ plan.promotion.name }}</li><li><CheckCircle2 :size="17" />{{ plan.includedCredits }} 创作点 / 周期</li><li><CheckCircle2 :size="17" />{{ plan.concurrency }} 路并发任务</li><li><CheckCircle2 :size="17" />{{ plan.allowByok ? '支持个人 API 密钥' : '统一模型渠道' }}</li><li v-if="plan.trialDays"><CheckCircle2 :size="17" />{{ plan.trialDays }} 天免费试用</li></ul></article>
              <section v-if="!upgradeSubscriptionPlans.length" class="workspace-upgrade-empty"><WalletCards :size="24" /><strong>套餐正在配置中</strong><span>管理员上架套餐后会显示在这里。</span></section>
            </div>
            <div v-else class="workspace-team-upgrade"><span><Users :size="26" /></span><h3>团队协作空间</h3><p>集中维护团队成员，让已注册用户加入同一个组织空间。</p><div class="workspace-team-stats"><span><strong>{{ teams.length }}</strong><small>已加入团队</small></span><span><strong>{{ teamMemberTotal }}</strong><small>团队成员</small></span></div><button type="button" @click="openTeamSettings">创建或管理团队</button></div>
            <small v-if="planMessage" class="settings-feedback" :class="{ 'is-error': planError }">{{ planMessage }}</small>
          </section>
        </div>
        <div v-if="paymentIntent" class="settings-payment-layer" @mousedown.self="closePayment">
          <section class="settings-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-dialog-title">
            <header><div><span>安全收银台</span><h3 id="payment-dialog-title">{{ paymentTransaction ? '等待支付结果' : '选择支付方式' }}</h3><p>{{ paymentIntent.productName }}</p></div><button type="button" aria-label="关闭收银台" @click="closePayment"><X :size="18" /></button></header>
            <template v-if="!paymentTransaction">
              <div class="settings-payment-total"><span>应付金额</span><strong>{{ formatMoney(paymentQuote?.amountCents ?? paymentIntent.amountCents) }}</strong></div>
              <div v-if="paymentIntent.orderType === 'SUBSCRIPTION' && !paymentIntent.existingOrderId" class="settings-checkout-discounts">
                <label><span>优惠券</span><select v-model="selectedCouponId" :disabled="paymentBusy" @change="refreshPaymentQuote"><option value="">不使用优惠券</option><option v-for="coupon in availablePaymentCoupons" :key="coupon.id" :value="coupon.id">{{ coupon.template.name }} · {{ coupon.template.discountType === 'FIXED' ? `立减 ${formatMoney(coupon.template.discountValue)}` : `优惠 ${coupon.template.discountValue / 100}%` }}</option></select></label>
                <dl v-if="paymentQuote"><div><dt>日常价</dt><dd>{{ formatMoney(paymentQuote.originalAmountCents) }}</dd></div><div v-if="paymentQuote.promotionDiscountCents"><dt>{{ paymentQuote.promotion?.label || '活动优惠' }}</dt><dd>-{{ formatMoney(paymentQuote.promotionDiscountCents) }}</dd></div><div v-if="paymentQuote.couponDiscountCents"><dt>优惠券</dt><dd>-{{ formatMoney(paymentQuote.couponDiscountCents) }}</dd></div></dl>
                <small v-if="paymentQuote?.couponMessage">{{ paymentQuote.couponMessage }}</small>
              </div>
              <div v-if="eligiblePaymentChannels.length" class="settings-payment-channels">
                <button v-for="channel in eligiblePaymentChannels" :key="channel.id" type="button" :class="{ active: selectedPaymentChannelId === channel.id }" @click="selectPaymentChannel(channel)">
                  <span class="settings-payment-channel-icon"><CreditCard v-if="channel.providerKey === 'STRIPE'" :size="18" /><Banknote v-else-if="channel.providerKey === 'MANUAL'" :size="18" /><QrCode v-else :size="18" /></span><span><strong>{{ channel.name }}</strong><small>{{ paymentProviderText[channel.providerKey] || channel.providerKey }}</small></span><i><CheckCircle2 v-if="selectedPaymentChannelId === channel.id" :size="17" /></i>
                </button>
              </div>
              <div v-if="selectedPaymentChannel" class="settings-payment-methods"><span>付款方式</span><div><button v-for="method in selectedPaymentChannel.supportedMethods" :key="method" type="button" :class="{ active: selectedPaymentMethod === method }" @click="selectedPaymentMethod = method">{{ paymentMethodText[method] || method }}</button></div></div>
              <p v-if="!eligiblePaymentChannels.length" class="settings-payment-empty">当前金额暂无可用支付渠道，请联系管理员或稍后再试。</p>
              <p v-if="paymentError" class="settings-feedback is-error">{{ paymentError }}</p>
              <footer><button type="button" @click="closePayment">取消</button><button type="button" :disabled="paymentBusy || !selectedPaymentChannel || !selectedPaymentMethod" @click="confirmCheckout"><LoaderCircle v-if="paymentBusy" class="settings-payment-spin" :size="15" />{{ paymentBusy ? '正在创建订单' : `确认支付 ${formatMoney(paymentQuote?.amountCents ?? paymentIntent.amountCents)}` }}</button></footer>
            </template>
            <template v-else>
              <div class="settings-payment-state" :class="paymentTransaction.status.toLowerCase()"><span><LoaderCircle v-if="['PENDING', 'PAID'].includes(paymentTransaction.status)" class="settings-payment-spin" :size="24" /><CheckCircle2 v-else-if="paymentTransaction.status === 'COMPLETED'" :size="24" /><CircleGauge v-else :size="24" /></span><div><strong>{{ paymentStatusTitle }}</strong><small>交易号 {{ paymentTransaction.outTradeNo }}</small></div><b>{{ formatMoney(paymentTransaction.amountCents) }}</b></div>
              <img v-if="paymentTransaction.qrCodeUrl" class="settings-payment-qr" :src="paymentTransaction.qrCodeUrl" alt="付款二维码" />
              <p v-if="paymentInstructions" class="settings-payment-instructions">{{ paymentInstructions }}</p>
              <p v-if="paymentError" class="settings-feedback is-error">{{ paymentError }}</p>
              <footer><button type="button" @click="closePayment">稍后查看</button><a v-if="paymentTransaction.checkoutUrl" :href="paymentTransaction.checkoutUrl" target="_blank" rel="noreferrer">前往支付</a><button v-if="!['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(paymentTransaction.status)" type="button" :disabled="paymentBusy" @click="refreshPaymentStatus">我已完成支付</button></footer>
            </template>
          </section>
        </div>
        <div v-if="credentialEditor" class="settings-credential-layer" @mousedown.self="credentialEditor = null"><form class="settings-credential-editor" @submit.prevent="saveCredential"><header><div><h3>{{ credentialEditor.id ? '编辑 API 密钥' : '添加 API 密钥' }}</h3><p>密钥会加密保存在服务器，页面只显示末尾四位。</p></div><button type="button" aria-label="关闭" @click="credentialEditor = null"><X :size="18" /></button></header><label><span>渠道模板</span><select v-model="credentialEditor.templateId" @change="applyCredentialTemplate"><option value="">自定义兼容渠道</option><option v-for="item in providerTemplates" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><label><span>名称</span><input v-model.trim="credentialEditor.name" required maxlength="80" placeholder="我的 NewAPI" /></label><label><span>服务类型</span><select v-model="credentialEditor.providerType"><option value="NEW_API">NewAPI</option><option value="SUB2API">Sub2API</option><option value="OPENAI">OpenAI 官方</option><option value="OPENAI_COMPATIBLE">其他 OpenAI 兼容</option></select></label><label><span>API Base URL</span><input v-model.trim="credentialEditor.baseUrl" required type="url" placeholder="https://api.example.com/v1" /></label><label><span>API 密钥</span><input v-model.trim="credentialEditor.apiKey" :required="!credentialEditor.id" type="password" autocomplete="new-password" :placeholder="credentialEditor.id ? `留空保留 ${credentialEditor.apiKeyHint}` : 'sk-...'" /></label><label><span>认证方式</span><select v-model="credentialEditor.authType"><option value="BEARER">Authorization Bearer</option><option value="X_API_KEY">x-api-key</option><option value="BOTH">同时发送</option></select></label><div class="settings-credential-routing"><label><span>优先级</span><input v-model.number="credentialEditor.priority" type="number" min="-10000" max="10000" /></label><label><span>权重</span><input v-model.number="credentialEditor.weight" type="number" min="1" max="10000" /></label></div><div class="settings-credential-toggles"><label><input v-model="credentialEditor.enabled" type="checkbox" />启用</label><label><input v-model="credentialEditor.isDefault" type="checkbox" />设为默认密钥</label><label><input v-model="credentialEditor.autoImport" type="checkbox" />保存后自动识别并导入全部可用模型</label></div><p v-if="credentialError" class="settings-feedback is-error">{{ credentialError }}</p><footer><button type="button" @click="credentialEditor = null">取消</button><button type="submit" :disabled="credentialSaving">{{ credentialSaving ? '保存中' : '保存' }}</button></footer></form></div>
        <div v-if="privateModelEditor" class="settings-credential-layer" @mousedown.self="privateModelEditor = null"><form class="settings-credential-editor settings-private-model-editor" @submit.prevent="savePrivateModel"><header><div><h3>{{ privateModelEditor.id ? '编辑私有模型' : '添加私有模型' }}</h3><p>模型只对当前账户可见，不会失败后静默使用平台付费线路。</p></div><button type="button" aria-label="关闭" @click="privateModelEditor = null"><X :size="18" /></button></header><label><span>显示名称</span><input v-model.trim="privateModelEditor.displayName" required maxlength="100" /></label><div class="settings-credential-routing"><label><span>能力</span><select v-model="privateModelEditor.capability"><option value="CHAT">对话</option><option value="IMAGE">图片</option><option value="VIDEO">视频</option><option value="COMMERCE">电商</option></select></label><label><span>路由策略</span><select v-model="privateModelEditor.routingStrategy"><option value="PRIORITY">优先级故障切换</option><option value="WEIGHTED">按权重分流</option><option value="ROUND_ROBIN">轮询</option></select></label></div><label><span>接口协议</span><select v-model="privateModelEditor.apiProtocol"><option value="openai">OpenAI Compatible</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Gemini GenerateContent</option></select></label><section class="settings-private-routes"><header><strong>密钥路由</strong><button type="button" @click="addPrivateModelRoute"><CirclePlus :size="14" />增加</button></header><article v-for="(route, index) in privateModelEditor.routes" :key="index"><select v-model="route.credentialId" required><option value="" disabled>选择密钥</option><option v-for="credential in apiCredentials" :key="credential.id" :value="credential.id">{{ credential.name }}</option></select><input v-model.trim="route.upstreamModel" required list="discovered-model-options" placeholder="上游模型 ID" /><input v-model.number="route.priority" type="number" title="优先级" placeholder="优先级" /><input v-model.number="route.weight" type="number" min="1" title="权重" placeholder="权重" /><button type="button" aria-label="删除路由" @click="privateModelEditor.routes.splice(index, 1)"><Trash2 :size="15" /></button></article><datalist id="discovered-model-options"><option v-for="name in discoveredCredentialModels" :key="name" :value="name" /></datalist></section><div class="settings-credential-toggles"><label><input v-model="privateModelEditor.enabled" type="checkbox" />启用</label><label><input v-model="privateModelEditor.isDefault" type="checkbox" />设为该能力默认模型</label></div><p v-if="privateModelError" class="settings-feedback is-error">{{ privateModelError }}</p><footer><button type="button" @click="privateModelEditor = null">取消</button><button type="submit" :disabled="privateModelSaving || !privateModelEditor.routes.length">{{ privateModelSaving ? '保存中' : '保存模型' }}</button></footer></form></div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { paymentMethodText, paymentProviderText, type PaymentMethodKey, type PaymentProviderKey } from '../constants/payment'
import {
  Archive,
  Banknote,
  BriefcaseBusiness,
  BookOpen,
  Blocks,
  Code2,
  Bell,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  CirclePlus,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  KeyRound,
  FolderKanban,
  Gift,
  Image as ImageIcon,
  ExternalLink,
  LifeBuoy,
  LibraryBig,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  LogOut,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  QrCode,
  Search,
  ServerCog,
  Share2,
  Settings,
  SlidersHorizontal,
  ShoppingBag,
  SquarePen,
  Sparkles,
  Sun,
  Trash2,
  Users,
  UserRound,
  Wrench,
  WalletCards,
  Webhook,
  X,
} from 'lucide-vue-next'
import BrandMark from './BrandMark.vue'
import SupportCenter from './SupportCenter.vue'
import type { ConversationSummary, StudioMode } from '../types'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { useStudioStore } from '../stores/studio'
import { api } from '../services/api'
import { readStoredSettings, updateStoredSettings, writeStoredSettings } from '../utils/settings-storage'

const props = defineProps<{
  activeMode: StudioMode
  canvasRoute?: boolean
}>()

const sidebarOpen = ref(true)
const workspaceMain = ref<HTMLElement | null>(null)
const mobileOpen = ref(false)
const recentOpen = ref(true)
const recentSearchOpen = ref(false)
const conversationSearch = ref('')
const recentConversationPageSize = 30
const recentVisibleCount = ref(recentConversationPageSize)
const conversationMenuId = ref('')
const conversationMenuElement = ref<HTMLElement | null>(null)
const conversationMenuPosition = reactive({ left: 0, top: 0 })
const conversationActionBusy = ref(false)
const renamingConversationId = ref('')
const conversationRename = ref('')
const conversationRenameBusy = ref(false)
const settingsOpen = ref(false)
const upgradeOpen = ref(false)
const pricingMode = ref<'personal' | 'team'>('personal')
const chatActionsOpen = ref(false)
type SettingsSection = 'general' | 'personalization' | 'notifications' | 'data' | 'plan' | 'api' | 'credits' | 'redeem' | 'invite' | 'workspace' | 'teams' | 'support' | 'account'
const settingsSection = ref<SettingsSection>('general')
const settingsNavElement = ref<HTMLElement | null>(null)
const accountOpen = ref(false)
const auth = useAuthStore()
const catalog = useCatalogStore()
const studio = useStudioStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const message = useMessage()
interface UserSettingsResponse { appearance?: string; language?: string; responseStyle?: string; responseDetail?: string; replyLanguage?: string; customInstructions?: string; nickname?: string; occupation?: string; bio?: string; useMemory?: boolean; referenceChats?: boolean; notifications?: boolean; chatHistoryEnabled?: boolean; trainingOptOut?: boolean; temporaryChatDefault?: boolean; dataRetentionDays?: number; shareUsageAnalytics?: boolean }
interface UserResponse { settings?: UserSettingsResponse | null; creditAccount?: { balance: number } | null }
interface NotificationItem { id: string; title?: string; body?: string; content?: string; readAt?: string | null; createdAt: string }
interface ModerationAppeal { id: string; status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; reason: string; reviewNote: string; createdAt: string; reviewedAt?: string | null }
interface ModerationCase { id: string; source: string; action: string; status: 'OPEN' | 'APPROVED' | 'DISMISSED'; contentExcerpt: string; createdAt: string; appeal?: ModerationAppeal | null }
interface CreditEntry { id: string; amount: number; description: string; createdAt: string }
interface InviteInfo { code: string; url: string; invited: number; reward: number; pending: number; reviewRequired: number }
type ProviderType = 'OPENAI' | 'NEW_API' | 'SUB2API' | 'OPENAI_COMPATIBLE'
type AuthType = 'BEARER' | 'X_API_KEY' | 'BOTH'
interface ProviderTemplate { id: string; name: string; type: ProviderType; baseUrl: string; authType: AuthType; apiProtocol: 'openai' | 'anthropic' | 'gemini'; supportsDiscovery: boolean }
interface ApiCredential { id: string; name: string; templateId?: string | null; providerType: ProviderType; baseUrl: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean; priority: number; weight: number; lastHealthStatus?: string | null; lastRotatedAt?: string | null; expiresAt?: string | null; totalRequests?: number; totalFailures?: number; inputTokens?: string; outputTokens?: string }
interface CredentialEditor extends Partial<ApiCredential> { name: string; templateId: string; providerType: ProviderType; baseUrl: string; apiKey: string; apiKeyHint: string; authType: AuthType; enabled: boolean; isDefault: boolean; priority: number; weight: number; expiresAt: string; autoImport: boolean }
interface PrivateModelRoute { id?: string; credentialId: string; upstreamModel: string; enabled: boolean; priority: number; weight: number; credential: Pick<ApiCredential, 'id' | 'name' | 'apiKeyHint' | 'enabled' | 'lastHealthStatus'> }
interface PrivateModel { id: string; displayName: string; description: string; capability: AvailableModel['capability']; apiProtocol: 'openai' | 'anthropic' | 'gemini'; routingStrategy: 'PRIORITY' | 'WEIGHTED' | 'ROUND_ROBIN'; enabled: boolean; isDefault: boolean; routes: PrivateModelRoute[] }
interface PrivateModelEditor extends Omit<PrivateModel, 'routes'> { routes: Array<Omit<PrivateModelRoute, 'credential'>> }
interface RechargePackage { id: string; name: string; credits: number; priceCents: number; recommended: boolean }
interface RechargeOrder { id: string; status: string; amountCents: number; createdAt: string; package?: { name: string } | null }
interface SubscriptionPlan { id: string; code: string; name: string; description: string; billingCycle: 'MONTHLY' | 'YEARLY' | 'ONE_TIME'; priceCents: number; effectivePriceCents?: number; promotion?: { id: string; name: string; label: string; endsAt: string } | null; includedCredits: number; trialDays: number; concurrency: number; allowByok: boolean; imageAccess: boolean; videoAccess: boolean; commerceAccess: boolean; recommended: boolean }
interface Subscription { id: string; planId: string; status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE'; currentPeriodEnd?: string | null; trialEndsAt?: string | null; cancelAtPeriodEnd: boolean; autoRenewEnabled?: boolean; renewalChannelId?: string | null; graceEndsAt?: string | null; plan: SubscriptionPlan }
interface SubscriptionOrder { id: string; status: string; amountCents: number; originalAmountCents?: number; promotionDiscountCents?: number; couponDiscountCents?: number; userCouponId?: string | null; paymentMethod: PaymentMethodKey; createdAt: string; plan: { id: string; name: string } }
interface CouponTemplate { id: string; code: string; name: string; description: string; discountType: 'FIXED' | 'PERCENT'; discountValue: number; minimumSpendCents: number; stackWithPromotion: boolean; products: Array<{ planId: string }> }
interface UserCoupon { id: string; status: 'AVAILABLE' | 'LOCKED' | 'REDEEMED' | 'EXPIRED' | 'REVOKED'; expiresAt?: string | null; template: CouponTemplate }
interface CouponWallet { coupons: UserCoupon[]; templates: Array<CouponTemplate & { claimedCount: number; perUserLimit: number; totalLimit?: number | null; issuedCount: number; validDays?: number | null }> }
interface CommerceQuote { originalAmountCents: number; promotionDiscountCents: number; couponDiscountCents: number; amountCents: number; promotion?: { id: string; name: string; label: string; endsAt: string } | null; coupon?: { id: string; name: string; code: string } | null; couponMessage?: string }
interface RenewalOptions { subscription: Subscription | null; channels: Array<{ id: string; name: string; providerKey: string; supportedMethods: string[] }>; mode: 'PAYMENT_LINK'; automaticChargeSupported: false; graceDays: number; reminderDays: number }
interface RenewalAttempt { id: string; status: string; attemptNumber: number; orderId?: string | null; failureReason: string; createdAt: string }
interface BillingProfile { profileType: 'PERSONAL' | 'COMPANY'; title: string; taxId: string; invoiceEmail: string; phone: string; address: string; bankName: string; bankAccount: string }
interface InvoiceTransaction { id: string; outTradeNo: string; orderType: string; status: string; amountCents: number; currency: string; paymentMethod: string; completedAt?: string | null }
interface InvoiceRequest { id: string; status: string; amountCents: number; currency: string; invoiceType: string; invoiceNumber: string; invoiceUrl: string; rejectionReason: string; requestedAt: string; transaction: { outTradeNo: string } }
interface DeletionRequest { id: string; status: 'REQUESTED' | 'PROCESSING' | 'FAILED'; requestedAt: string; scheduledAt: string; failureReason: string }
interface PaymentChannel { id: string; name: string; providerKey: PaymentProviderKey; isDefault: boolean; supportedMethods: PaymentMethodKey[]; minAmountCents: number; maxAmountCents?: number | null }
interface PaymentIntent { orderType: 'SUBSCRIPTION' | 'RECHARGE'; productId: string; productName: string; amountCents: number; existingOrderId?: string }
interface PaymentTransaction { id: string; outTradeNo: string; amountCents: number; currency: string; status: string; checkoutUrl?: string; qrCodeUrl?: string; failureReason?: string; metadata?: { instructions?: string } }
interface ExternalNavLinkItem { id: string; key: string; name: string; description: string; url: string; icon: string; enabled: boolean; openNewTab: boolean; sortOrder: number }
interface AvailableModel { key: string; displayName: string; capability: 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE' }
interface TeamMember { userId: string; role: string; monthlyCreditLimit: number | null; creditsUsed: number; creditPeriodStart: string; user: { displayName: string; email: string | null } }
interface TeamInvitation { id: string; email: string; role: string; expiresAt: string }
interface PendingTeamInvitation { id: string; role: string; expiresAt: string; team: { id: string; name: string; owner: { displayName: string } } }
interface Team { id: string; name: string; slug: string; description: string; ownerId: string; seatLimit: number; billingEnabled: boolean; creditAccount?: { balance: number; updatedAt: string } | null; members: TeamMember[]; invitations: TeamInvitation[]; _count?: { projects: number; assets: number; knowledgeBases: number } }
interface TeamCreditEntry extends CreditEntry { balanceAfter: number; user?: { displayName: string; email: string | null } | null }
interface WorkspaceAsset { id: string; name: string; teamId?: string | null }
interface KnowledgeBaseAsset { assetId: string; chunkCount: number; asset: WorkspaceAsset }
interface KnowledgeBase { id: string; name: string; description: string; status: string; documentCount: number; chunkCount: number; teamId?: string | null; team?: { id: string; name: string } | null; creator?: { id: string; displayName: string }; assets: KnowledgeBaseAsset[] }
interface TeamResources { projects: Array<{ id: string; name: string; workflowStatus: string; _count: { assets: number; conversations: number } }>; assets: Array<{ id: string; name: string; kind: string }>; knowledgeBases: Array<{ id: string; name: string; documentCount: number }> }
interface AssistantToolBinding { key: string; assistant: { id: string; name: string }; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; approval?: { id: string; status: string; expiresAt?: string | null } }
interface WorkspaceNavItem { key: string; mode: StudioMode; activeModes?: StudioMode[]; label: string; icon: Component; to: string; external: boolean; openNewTab: boolean }
const notifications = ref<NotificationItem[]>([])
const moderationCases = ref<ModerationCase[]>([])
const appealDrafts = reactive<Record<string, string>>({})
const appealBusyId = ref('')
const appealMessage = ref('')
const appealError = ref(false)
const creditLedger = ref<CreditEntry[]>([])
const inviteInfo = reactive<InviteInfo>({ code: '', url: '', invited: 0, reward: 0, pending: 0, reviewRequired: 0 })
const settingsHydrated = ref(false)
const workspaceDataLoaded = ref(false)
const settingsMessage = ref('')
const redeemMessage = ref('')
const redeemError = ref(false)
const redeeming = ref(false)
const inviteCopied = ref(false)
const teams = ref<Team[]>([])
const pendingTeamInvitations = ref<PendingTeamInvitation[]>([])
const teamDraft = reactive({ name: '', description: '' })
const teamInviteId = ref('')
const teamInviteEmail = ref('')
const teamInviteRole = ref<'MEMBER' | 'ADMIN'>('MEMBER')
const teamBusy = ref(false)
const teamMessage = ref('')
const teamError = ref(false)
const expandedTeamId = ref('')
const teamResources = reactive<Record<string, TeamResources | undefined>>({})
const teamLedgerOpenId = ref('')
const teamCreditLedgers = reactive<Record<string, TeamCreditEntry[] | undefined>>({})
const teamQuotaDrafts = reactive<Record<string, string>>({})
const knowledgeBases = ref<KnowledgeBase[]>([])
const workspaceAssets = ref<WorkspaceAsset[]>([])
const toolApprovals = ref<{ id: string; assistant?: { id: string; name: string } | null; tool: { id: string; key: string; name: string; description: string; requiresApproval: boolean }; status: string; expiresAt?: string | null }[]>([])
const workspaceTools = ref<AssistantToolBinding['tool'][]>([])
const workspaceAssistants = ref<{ id: string; name: string; tools: { toolId: string }[] }[]>([])
const workspaceBusy = ref(false)
const workspaceMessage = ref('')
const workspaceError = ref(false)
const knowledgeDraft = reactive({ name: '', description: '', teamId: '' })
const knowledgeAssetSelection = reactive<Record<string, string>>({})
const knowledgeTeamSelection = reactive<Record<string, string>>({})
const teamRoleText: Record<string, string> = { OWNER: '所有者', ADMIN: '管理员', MEMBER: '成员' }
const apiCredentials = ref<ApiCredential[]>([])
const providerTemplates = ref<ProviderTemplate[]>([])
const privateModels = ref<PrivateModel[]>([])
const credentialEditor = ref<CredentialEditor | null>(null)
const credentialSaving = ref(false)
const credentialError = ref('')
const credentialCheckingId = ref('')
const discoveredCredentialModels = ref<string[]>([])
const privateModelEditor = ref<PrivateModelEditor | null>(null)
const privateModelSaving = ref(false)
const privateModelError = ref('')
const publicSettings = reactive({
  userByokEnabled: true,
  rechargeEnabled: false,
  subscriptionsEnabled: true,
  trialEnabled: false,
  currency: 'CNY',
  sidebarCreationEnabled: true,
  sidebarCommerceEnabled: true,
  sidebarOfficeEnabled: true,
  sidebarPromptsEnabled: true,
  sidebarPluginsEnabled: true,
  sidebarProjectsEnabled: true,
  sidebarAssetsEnabled: true,
})
const rechargePackages = ref<RechargePackage[]>([])
const rechargeOrders = ref<RechargeOrder[]>([])
const rechargeMessage = ref('')
const creatingOrder = ref(false)
const subscriptionPlans = ref<SubscriptionPlan[]>([])
const currentSubscription = ref<Subscription | null>(null)
const subscriptionOrders = ref<SubscriptionOrder[]>([])
const couponWallet = reactive<CouponWallet>({ coupons: [], templates: [] })
const selectedCouponId = ref('')
const paymentQuote = ref<CommerceQuote | null>(null)
const couponBusyId = ref('')
const externalLinks = ref<ExternalNavLinkItem[]>([])
const availableModels = ref<AvailableModel[]>([])
const planBusy = ref(false)
const planMessage = ref('')
const planError = ref(false)
const renewalOptions = ref<RenewalOptions | null>(null)
const renewalAttempts = ref<RenewalAttempt[]>([])
const selectedRenewalChannelId = ref('')
const billingProfile = reactive<BillingProfile>({ profileType: 'COMPANY', title: '', taxId: '', invoiceEmail: '', phone: '', address: '', bankName: '', bankAccount: '' })
const invoiceTransactions = ref<InvoiceTransaction[]>([])
const invoiceRequests = ref<InvoiceRequest[]>([])
const selectedInvoiceTransactionId = ref('')
const billingBusy = ref(false)
const billingMessage = ref('')
const accountDeletion = ref<DeletionRequest | null>(null)
const deletionReason = ref('')
const deletionBusy = ref(false)
const deletionMessage = ref('')
const paymentChannels = ref<PaymentChannel[]>([])
const paymentIntent = ref<PaymentIntent | null>(null)
const selectedPaymentChannelId = ref('')
const selectedPaymentMethod = ref<PaymentMethodKey | ''>('')
const paymentTransaction = ref<PaymentTransaction | null>(null)
const paymentBusy = ref(false)
const paymentError = ref('')
let paymentPollTimer = 0
const dataActionBusy = ref(false)
const dataActionMessage = ref('')
const dataActionError = ref(false)
const rechargeStatusText: Record<string, string> = { PENDING: '待支付', PAID: '已到账', CANCELLED: '已取消', REFUNDED: '已退款' }
const renewalAttemptText: Record<string, string> = { SCHEDULED: '已计划', PROCESSING: '处理中', PAYMENT_REQUIRED: '待支付', SUCCEEDED: '成功', FAILED: '失败', CANCELLED: '已取消' }
const invoiceStatusText: Record<string, string> = { REQUESTED: '待审核', REVIEWING: '审核中', ISSUED: '已开具', REJECTED: '已拒绝', CANCELLED: '已撤销' }
const moderationSourceText: Record<string, string> = { CHAT: '对话', IMAGE: '图片生成', COMMERCE: '商品视觉', FILE_NAME: '文件', SUPPORT: '客服' }
const providerTypeLabel: Record<ProviderType, string> = { OPENAI: 'OpenAI', NEW_API: 'NewAPI', SUB2API: 'Sub2API', OPENAI_COMPATIBLE: 'OpenAI 兼容' }
const routingStrategyLabel: Record<string, string> = { PRIORITY: '优先级', WEIGHTED: '权重分流', ROUND_ROBIN: '轮询' }
const modelCapabilityLabel: Record<AvailableModel['capability'], string> = { CHAT: '对话', IMAGE: '图片', VIDEO: '视频', COMMERCE: '商品图' }
const unreadCount = computed(() => notifications.value.filter((item) => !item.readAt).length)
const currentPlanName = computed(() => currentSubscription.value?.plan.name || '免费版')
const currentConversation = computed(() => studio.conversations.find((item) => item.id === studio.currentConversationId) || null)
const showUpgradeEntry = computed(() => publicSettings.subscriptionsEnabled || publicSettings.trialEnabled || subscriptionPlans.value.length > 0)
const upgradeSubscriptionPlans = computed(() => subscriptionPlans.value.filter((plan) => plan.priceCents > 0 || plan.trialDays > 0))
const teamMemberTotal = computed(() => teams.value.reduce((total, team) => total + team.members.length, 0))
const manageableTeams = computed(() => teams.value.filter((team) => team.ownerId === auth.session?.id || team.members.some((member) => member.userId === auth.session?.id && member.role === 'ADMIN')))
const currentTeamMember = (team: Team) => team.members.find((member) => member.userId === auth.session?.id)
const isTeamManager = (team: Team) => team.ownerId === auth.session?.id || currentTeamMember(team)?.role === 'ADMIN'
watch(teams, (rows) => rows.forEach((team) => team.members.forEach((member) => { teamQuotaDrafts[`${team.id}:${member.userId}`] = member.monthlyCreditLimit === null ? '' : String(member.monthlyCreditLimit) })), { deep: true, immediate: true })
const assistantToolBindings = computed<AssistantToolBinding[]>(() => {
  const bindings: AssistantToolBinding[] = []
  for (const assistant of workspaceAssistants.value) {
    for (const item of assistant.tools || []) {
      const tool = workspaceTools.value.find((entry) => entry.id === item.toolId)
      if (!tool) continue
      const approval = toolApprovals.value.find((entry) => entry.tool.id === tool.id && entry.assistant?.id === assistant.id)
      bindings.push({ key: `${assistant.id}:${tool.id}`, assistant: { id: assistant.id, name: assistant.name }, tool, approval })
    }
  }
  return bindings
})
const loginMethodLabel = computed(() => ({ password: '邮箱 / 密码', email: '邮箱验证码', linuxdo: 'Linux.do', community: '第三方账号' }[auth.session?.provider || 'community']))
const hasPublicEmail = computed(() => Boolean(auth.session?.email && !auth.session.email.endsWith('@auth.xinyue.local')))
const accountIdentityLabel = computed(() => hasPublicEmail.value ? '电子邮件' : '用户名')
const accountIdentityHint = computed(() => hasPublicEmail.value ? '已绑定邮箱' : '此账户未绑定邮箱')
const accountIdentity = computed(() => hasPublicEmail.value ? auth.session?.email : auth.session?.username || auth.displayName)
const subscriptionEndText = computed(() => {
  const subscription = currentSubscription.value
  if (!subscription?.currentPeriodEnd) return '长期有效'
  const date = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(subscription.currentPeriodEnd))
  if (subscription.status === 'TRIALING') return `试用至 ${date}`
  return subscription.cancelAtPeriodEnd ? `${date} 到期后停止` : `下一周期：${date}`
})
const eligiblePaymentChannels = computed(() => paymentIntent.value ? paymentChannels.value.filter((item) => item.minAmountCents <= paymentIntent.value!.amountCents && (!item.maxAmountCents || item.maxAmountCents >= paymentIntent.value!.amountCents)) : [])
const availablePaymentCoupons = computed(() => {
  const planId = paymentIntent.value?.orderType === 'SUBSCRIPTION' ? paymentIntent.value.productId : ''
  return couponWallet.coupons.filter((coupon) => coupon.status === 'AVAILABLE' && (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date()) && (!coupon.template.products.length || coupon.template.products.some((item) => item.planId === planId)))
})
const selectedPaymentChannel = computed(() => eligiblePaymentChannels.value.find((item) => item.id === selectedPaymentChannelId.value) || null)
const paymentInstructions = computed(() => String(paymentTransaction.value?.metadata?.instructions || ''))
const paymentStatusTitle = computed(() => ({ PENDING: '等待完成付款', PAID: '付款已确认，正在发放权益', COMPLETED: '支付完成，权益已到账', FAILED: '支付或权益入账失败', CANCELLED: '交易已取消', EXPIRED: '交易已过期', REFUNDED: '交易已退款' }[paymentTransaction.value?.status || ''] || '正在确认交易'))
const filteredConversations = computed(() => {
  const query = conversationSearch.value.trim().toLocaleLowerCase()
  if (!query) return studio.conversations
  return studio.conversations.filter((item) => item.title.toLocaleLowerCase().includes(query))
})
const visibleRecentConversations = computed(() => filteredConversations.value.slice(0, recentVisibleCount.value))
const hasMoreRecentConversations = computed(() => visibleRecentConversations.value.length < filteredConversations.value.length)
watch(conversationSearch, () => { recentVisibleCount.value = recentConversationPageSize })
const activeConversationMenu = computed(() => studio.conversations.find((item) => item.id === conversationMenuId.value) || null)
const mobileTitle = computed(() => ({ chat: 'Xinyue AI', images: t('workspace.creation'), videos: t('workspace.creation'), commerce: t('studio.commerce'), office: t('workspace.office'), prompts: t('workspace.prompts'), plugins: t('workspace.plugins'), workspace: '工作空间' } as Partial<Record<StudioMode, string>>)[props.activeMode] || '')
const storedSettings = readStoredSettings()
const storedLanguage = storedSettings.language === 'English' ? 'en' : storedSettings.language === '中文' ? 'zh-CN' : storedSettings.language
const storedAppearance = storedSettings.appearance === 'light' ? '浅色' : storedSettings.appearance === 'dark' ? '深色' : storedSettings.appearance === 'system' ? '跟随系统' : storedSettings.appearance
const settings = reactive({
  notifications: storedSettings.notifications ?? true,
  rememberModel: storedSettings.rememberModel ?? true,
  language: storedLanguage || 'zh-CN',
  appearance: storedAppearance || '深色',
  style: storedSettings.style || '默认',
  detail: storedSettings.detail || '自动判断',
  replyLanguage: storedSettings.replyLanguage || '跟随对话',
  customInstructions: storedSettings.customInstructions || '',
  nickname: storedSettings.nickname || '',
  occupation: storedSettings.occupation || '',
  bio: storedSettings.bio || '',
  useMemory: storedSettings.useMemory ?? true,
  referenceChats: storedSettings.referenceChats ?? true,
  chatHistoryEnabled: storedSettings.chatHistoryEnabled ?? true,
  trainingOptOut: storedSettings.trainingOptOut ?? true,
  temporaryChatDefault: storedSettings.temporaryChatDefault ?? false,
  dataRetentionDays: storedSettings.dataRetentionDays ?? 0,
  shareUsageAnalytics: storedSettings.shareUsageAnalytics ?? false,
  redeemCode: '',
})
const settingsNav = computed(() => [
  { id: 'general' as const, label: t('settings.general'), icon: Sun },
  { id: 'personalization' as const, label: t('settings.personalization'), icon: Sparkles },
  { id: 'notifications' as const, label: t('settings.notifications'), icon: Bell },
  { id: 'data' as const, label: t('settings.data'), icon: SlidersHorizontal },
  { id: 'plan' as const, label: '套餐与账单', icon: WalletCards },
  { id: 'api' as const, label: t('settings.api'), icon: KeyRound },
  { id: 'credits' as const, label: t('settings.credits'), icon: CircleGauge },
  { id: 'redeem' as const, label: t('settings.redeem'), icon: CirclePlus },
  { id: 'invite' as const, label: t('settings.invite'), icon: Gift },
  { id: 'workspace' as const, label: '知识与工具', icon: BookOpen },
  { id: 'teams' as const, label: '团队空间', icon: Users },
  { id: 'support' as const, label: '帮助与客服', icon: LifeBuoy },
  { id: 'account' as const, label: t('settings.account'), icon: UserRound },
])

function applyTheme() {
  document.documentElement.dataset.studioTheme = settings.appearance === '浅色' ? 'light' : settings.appearance === '深色' ? 'dark' : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  locale.value = settings.language
  document.documentElement.lang = settings.language
}

watch(() => [settings.appearance, settings.language], applyTheme, { immediate: true })
let settingsTimer = 0
watch(settings, () => {
  writeStoredSettings({ ...settings, redeemCode: '' })
  if (!settingsHydrated.value) return
  window.clearTimeout(settingsTimer)
  settingsTimer = window.setTimeout(() => { void saveSettings(false) }, 450)
}, { deep: true })
watch(() => props.activeMode, async () => {
  closeConversationMenu()
  mobileOpen.value = false
  accountOpen.value = false
  chatActionsOpen.value = false
  await nextTick()
  workspaceMain.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
})
watch(() => route.fullPath, closeConversationMenu)
onMounted(async () => {
  document.body.classList.add('has-workspace')
  document.addEventListener('pointerdown', handleConversationMenuOutside)
  document.addEventListener('keydown', handleConversationMenuKeydown)
  window.addEventListener('resize', closeConversationMenu)
  try {
    await auth.refresh()
    await loadWorkspaceData()
  } finally {
    workspaceDataLoaded.value = true
    settingsHydrated.value = true
  }
  const teamInviteToken = typeof route.query.teamInviteToken === 'string' ? route.query.teamInviteToken : ''
  if (teamInviteToken && auth.session?.id) {
    try {
      const result = await api<{ teamName: string }>(`/team-invitations/${encodeURIComponent(teamInviteToken)}/accept`, { method: 'POST' })
      await loadDeferredWorkspaceData()
      teams.value = await api<Team[]>('/teams')
      teamMessage.value = `已加入团队“${result.teamName}”`
      teamError.value = false
    } catch (reason) {
      teamMessage.value = reason instanceof Error ? reason.message : '接受团队邀请失败'
      teamError.value = true
    }
    const query = { ...route.query }
    delete query.teamInviteToken
    await router.replace({ query })
    openSettings('teams')
  }
  const requestedSection = String(route.query.settings || '') as SettingsSection
  if (settingsNav.value.some((item) => item.id === requestedSection)) openSettings(requestedSection)
})
onUnmounted(() => {
  document.body.classList.remove('has-workspace')
  document.removeEventListener('pointerdown', handleConversationMenuOutside)
  document.removeEventListener('keydown', handleConversationMenuKeydown)
  window.removeEventListener('resize', closeConversationMenu)
  window.clearTimeout(paymentPollTimer)
})

function openSettings(section: SettingsSection) {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  settingsSection.value = section
  settingsOpen.value = true
  accountOpen.value = false
  mobileOpen.value = false
  scrollActiveSetting('auto')
}

function openUpgrade() {
  document.dispatchEvent(new Event('xinyue:close-popovers'))
  upgradeOpen.value = true
  pricingMode.value = 'personal'
  settingsOpen.value = false
  accountOpen.value = false
  chatActionsOpen.value = false
}

function openTeamSettings() {
  upgradeOpen.value = false
  openSettings('teams')
}

function selectSettingsSection(section: SettingsSection) {
  settingsSection.value = section
  scrollActiveSetting('smooth')
}

function scrollActiveSetting(behavior: ScrollBehavior) {
  if (!window.matchMedia('(max-width: 640px)').matches) return
  void nextTick(() => settingsNavElement.value?.querySelector<HTMLElement>(`[data-section="${settingsSection.value}"]`)?.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' }))
}

function handleNav(mode: StudioMode) {
  mobileOpen.value = false
  if (mode === 'chat') studio.newConversation(settings.temporaryChatDefault || !settings.chatHistoryEnabled)
}

function handleNavLink(event: MouseEvent, item: WorkspaceNavItem) {
  if (item.external) return
  event.preventDefault()
  handleNav(item.mode)
  void router.push(item.to)
}

function settingsPayload() {
  return {
    appearance: settings.appearance === '浅色' ? 'light' : settings.appearance === '跟随系统' ? 'system' : 'dark', language: settings.language,
    responseStyle: settings.style, responseDetail: settings.detail, replyLanguage: settings.replyLanguage,
    customInstructions: settings.customInstructions, nickname: settings.nickname, occupation: settings.occupation,
    bio: settings.bio, useMemory: settings.useMemory, referenceChats: settings.referenceChats, notifications: settings.notifications,
    chatHistoryEnabled: settings.chatHistoryEnabled, trainingOptOut: settings.trainingOptOut, temporaryChatDefault: settings.temporaryChatDefault,
    dataRetentionDays: settings.dataRetentionDays, shareUsageAnalytics: settings.shareUsageAnalytics,
  }
}

async function saveSettings(showFeedback = false) {
  writeStoredSettings({ ...settings, redeemCode: '' })
  if (auth.session?.id) {
    try { await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }); if (showFeedback) settingsMessage.value = '已保存' }
    catch { if (showFeedback) settingsMessage.value = '保存失败，请稍后重试' }
  } else if (showFeedback) settingsMessage.value = '已保存到此设备'
}

async function loadWorkspaceData() {
  const [catalogSettings, links] = await Promise.all([
    catalog.load(),
    api<ExternalNavLinkItem[]>('/catalog/external-links').catch(() => []),
  ])
  Object.assign(publicSettings, catalogSettings)
  externalLinks.value = links
  if (!auth.session?.id) return
  const [, user, notices, cases, models, subscription] = await Promise.all([
    studio.hydrateWorkspace().catch(() => undefined),
    api<UserResponse>('/users/me').catch(() => null), api<NotificationItem[]>('/notifications').catch(() => []),
    api<ModerationCase[]>('/moderation/cases').catch(() => []),
    api<AvailableModel[]>('/catalog/models').catch(() => []),
    api<Subscription | null>('/subscriptions/me').catch(() => null),
  ])
  if (user?.settings) {
    hydrateSettings(user.settings)
    const pending = storedSettings.pendingServerSync
    if (pending?.changedAt && Date.now() - pending.changedAt < 5 * 60 * 1000) {
      if (pending.appearance) settings.appearance = pending.appearance === 'light' ? '浅色' : pending.appearance === 'system' ? '跟随系统' : '深色'
      if (pending.language) settings.language = pending.language
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(settingsPayload()) }).then(() => {
        updateStoredSettings((current) => current.pendingServerSync?.changedAt === pending.changedAt
          ? { ...current, pendingServerSync: undefined }
          : current)
      }).catch(() => undefined)
    }
  }
  notifications.value = notices
  moderationCases.value = cases
  availableModels.value = models
  currentSubscription.value = subscription
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  window.setTimeout(() => { void loadDeferredWorkspaceData() }, 200)
}

let deferredWorkspacePromise: Promise<void> | null = null
let deferredWorkspaceLoaded = false
function loadDeferredWorkspaceData() {
  if (deferredWorkspaceLoaded) return Promise.resolve()
  if (deferredWorkspacePromise) return deferredWorkspacePromise
  deferredWorkspacePromise = (async () => {
    const [ledger, invite, credentials, templates, userModels, packages, orders, modelPolicy, plans, planOrders, methods, teamRows, pendingInvites, knowledgeRows, tools, assistantRows, approvalRows, renewal, renewalHistory, profile, eligibleInvoices, invoices, deletion, wallet] = await Promise.all([
      api<CreditEntry[]>('/credits/ledger?take=30').catch(() => []),
      api<InviteInfo>('/invites/me').catch(() => null),
      api<ApiCredential[]>('/users/me/api-credentials').catch(() => []),
      api<ProviderTemplate[]>('/catalog/provider-templates').catch(() => []),
      api<PrivateModel[]>('/users/me/private-models').catch(() => []),
      api<RechargePackage[]>('/catalog/recharge-packages').catch(() => []),
      api<RechargeOrder[]>('/recharge/orders').catch(() => []),
      api<{ allowUserByok: boolean }>('/users/me/model-policy').catch(() => null),
      api<SubscriptionPlan[]>('/subscriptions/plans').catch(() => []),
      api<SubscriptionOrder[]>('/subscriptions/orders').catch(() => []),
      api<PaymentChannel[]>('/payments/methods').catch(() => []), api<Team[]>('/teams').catch(() => []),
      api<PendingTeamInvitation[]>('/team-invitations').catch(() => []),
      api<KnowledgeBase[]>('/knowledge-bases').catch(() => []),
      api<AssistantToolBinding['tool'][]>('/assistants/tools').catch(() => []), api<{ id: string; name: string; tools: { toolId: string }[] }[]>('/assistants').catch(() => []),
      api<typeof toolApprovals.value>('/tool-approvals').catch(() => []),
      api<RenewalOptions>('/subscriptions/renewal').catch(() => null),
      api<RenewalAttempt[]>('/subscriptions/renewal-attempts').catch(() => []),
      api<BillingProfile | null>('/billing/profile').catch(() => null),
      api<InvoiceTransaction[]>('/billing/invoice-transactions').catch(() => []),
      api<InvoiceRequest[]>('/billing/invoices').catch(() => []),
      api<DeletionRequest | null>('/users/me/deletion').catch(() => null),
      api<CouponWallet>('/commerce/coupons').catch(() => ({ coupons: [], templates: [] })),
    ])
  creditLedger.value = ledger
  if (invite) Object.assign(inviteInfo, invite)
  apiCredentials.value = credentials
  providerTemplates.value = templates
  privateModels.value = userModels
  rechargePackages.value = packages
  rechargeOrders.value = orders
  subscriptionPlans.value = plans
  subscriptionOrders.value = planOrders
  Object.assign(couponWallet, wallet)
  paymentChannels.value = methods
  teams.value = teamRows
  pendingTeamInvitations.value = pendingInvites
  knowledgeBases.value = knowledgeRows
  knowledgeRows.forEach((item) => { knowledgeTeamSelection[item.id] = item.teamId || '' })
  workspaceAssets.value = studio.assets.map((asset) => ({ id: asset.id, name: asset.title }))
  workspaceTools.value = tools
  workspaceAssistants.value = assistantRows
  toolApprovals.value = approvalRows
  renewalOptions.value = renewal
  renewalAttempts.value = renewalHistory
  if (renewal?.subscription) currentSubscription.value = renewal.subscription
  selectedRenewalChannelId.value = renewal?.subscription?.renewalChannelId || renewal?.channels[0]?.id || ''
  if (profile) Object.assign(billingProfile, profile)
  else if (auth.session?.email) billingProfile.invoiceEmail = auth.session.email
  invoiceTransactions.value = eligibleInvoices
  invoiceRequests.value = invoices
  accountDeletion.value = deletion
  if (modelPolicy) publicSettings.userByokEnabled = modelPolicy.allowUserByok
    deferredWorkspaceLoaded = true
  })().finally(() => { deferredWorkspacePromise = null })
  return deferredWorkspacePromise
}

function formatMoney(cents: number) { return new Intl.NumberFormat(settings.language, { style: 'currency', currency: publicSettings.currency }).format(cents / 100) }
async function createTeam() {
  if (!teamDraft.name.trim()) return
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api('/teams', { method: 'POST', body: JSON.stringify(teamDraft) }); teamDraft.name = ''; teamDraft.description = ''; teams.value = await api<Team[]>('/teams'); teamMessage.value = '团队已创建' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队创建失败' }
  finally { teamBusy.value = false }
}
async function inviteToTeam(teamId: string) {
  if (!teamInviteEmail.value.trim()) return
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try {
    const result = await api<{ acceptUrl: string; emailSent: boolean }>(`/teams/${teamId}/invitations`, { method: 'POST', body: JSON.stringify({ email: teamInviteEmail.value, role: teamInviteRole.value }) })
    teamInviteEmail.value = ''; teamInviteRole.value = 'MEMBER'; teamInviteId.value = ''; teams.value = await api<Team[]>('/teams')
    await navigator.clipboard.writeText(result.acceptUrl).catch(() => undefined)
    teamMessage.value = result.emailSent ? '邀请邮件已发送，邀请链接也已复制' : '邀请已创建，链接已复制；配置 SMTP 后可自动发送邮件'
  }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '邀请发送失败' }
  finally { teamBusy.value = false }
}
function formatInvitationExpiry(value: string) { return `${new Date(value).toLocaleDateString()} 到期` }
async function acceptTeamInvitation(invitationId: string) {
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/team-invitations/${invitationId}/accept-pending`, { method: 'POST' }); [teams.value, pendingTeamInvitations.value] = await Promise.all([api<Team[]>('/teams'), api<PendingTeamInvitation[]>('/team-invitations')]); teamMessage.value = '已加入团队' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '接受邀请失败' }
  finally { teamBusy.value = false }
}
async function cancelTeamInvitation(teamId: string, invitationId: string) {
  if (!window.confirm('确认取消这条团队邀请？')) return
  try { await api(`/teams/${teamId}/invitations/${invitationId}`, { method: 'DELETE' }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '邀请已取消'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '取消邀请失败' }
}
async function transferTeamOwnership(team: Team, member: TeamMember) {
  if (!window.confirm(`确认将“${team.name}”的所有权转让给 ${member.user.displayName}？`)) return
  try { await api(`/teams/${team.id}/transfer-ownership`, { method: 'POST', body: JSON.stringify({ targetUserId: member.userId }) }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '团队所有权已转让'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '所有权转让失败' }
}
async function removeTeamMember(teamId: string, userId: string) {
  if (!window.confirm('确认从团队中移除该成员？')) return
  try { await api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '成员已移除'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '移除成员失败' }
}
async function updateTeamMemberRole(teamId: string, userId: string, role: string) {
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/teams/${teamId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '成员角色已更新' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '角色更新失败'; teams.value = await api<Team[]>('/teams').catch(() => teams.value) }
  finally { teamBusy.value = false }
}
async function editTeam(team: Team) {
  const name = window.prompt('团队名称', team.name)?.trim()
  if (!name) return
  const description = window.prompt('团队说明', team.description)?.trim() ?? team.description
  const seatLimit = Number(window.prompt('团队席位数', String(team.seatLimit)) || team.seatLimit)
  if (!Number.isInteger(seatLimit) || seatLimit < team.members.length) return message.warning(`席位数不能少于当前成员数 ${team.members.length}`)
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/teams/${team.id}`, { method: 'PATCH', body: JSON.stringify({ name, description, seatLimit }) }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '团队资料已更新' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队更新失败' }
  finally { teamBusy.value = false }
}
async function leaveTeam(team: Team) {
  if (!window.confirm(`确认退出“${team.name}”？`)) return
  try { await api(`/teams/${team.id}/leave`, { method: 'POST' }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '已退出团队'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '退出团队失败' }
}
async function deleteTeam(team: Team) {
  if (!window.confirm(`永久删除“${team.name}”及其成员关系？`)) return
  try { await api(`/teams/${team.id}`, { method: 'DELETE' }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '团队已删除'; teamError.value = false }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队删除失败' }
}
async function toggleTeamResources(teamId: string) {
  if (expandedTeamId.value === teamId) { expandedTeamId.value = ''; return }
  expandedTeamId.value = teamId
  if (teamResources[teamId]) return
  teamBusy.value = true
  try { teamResources[teamId] = await api<TeamResources>(`/teams/${teamId}/resources`) }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队资源加载失败'; expandedTeamId.value = '' }
  finally { teamBusy.value = false }
}
async function toggleTeamBilling(team: Team) {
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/teams/${team.id}/billing`, { method: 'PATCH', body: JSON.stringify({ enabled: !team.billingEnabled }) }); teams.value = await api<Team[]>('/teams'); teamMessage.value = team.billingEnabled ? '团队共享支付已停用' : '团队共享支付已启用' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '共享支付设置失败' }
  finally { teamBusy.value = false }
}
async function saveTeamMemberQuota(team: Team, member: TeamMember) {
  const raw = teamQuotaDrafts[`${team.id}:${member.userId}`]?.trim() || ''
  const monthlyCreditLimit = raw === '' ? null : Number(raw)
  if (monthlyCreditLimit !== null && (!Number.isInteger(monthlyCreditLimit) || monthlyCreditLimit < 0)) return message.warning('月限额必须是大于等于 0 的整数，留空表示不限额')
  teamBusy.value = true; teamMessage.value = ''; teamError.value = false
  try { await api(`/teams/${team.id}/members/${member.userId}/quota`, { method: 'PATCH', body: JSON.stringify({ monthlyCreditLimit }) }); teams.value = await api<Team[]>('/teams'); teamMessage.value = '成员月度限额已更新' }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '成员限额更新失败' }
  finally { teamBusy.value = false }
}
async function toggleTeamLedger(teamId: string) {
  if (teamLedgerOpenId.value === teamId) { teamLedgerOpenId.value = ''; return }
  teamLedgerOpenId.value = teamId
  if (teamCreditLedgers[teamId]) return
  teamBusy.value = true
  try { teamCreditLedgers[teamId] = await api<TeamCreditEntry[]>(`/credits/teams/${teamId}/ledger?take=50`) }
  catch (reason) { teamError.value = true; teamMessage.value = reason instanceof Error ? reason.message : '团队额度流水加载失败'; teamLedgerOpenId.value = '' }
  finally { teamBusy.value = false }
}
async function reloadKnowledgeBases() {
  knowledgeBases.value = await api<KnowledgeBase[]>('/knowledge-bases')
  knowledgeBases.value.forEach((item) => { knowledgeTeamSelection[item.id] = item.teamId || '' })
}
async function createKnowledgeBase() {
  if (!knowledgeDraft.name.trim()) return
  workspaceBusy.value = true; workspaceMessage.value = ''; workspaceError.value = false
  try { await api('/knowledge-bases', { method: 'POST', body: JSON.stringify({ ...knowledgeDraft, teamId: knowledgeDraft.teamId || null }) }); knowledgeDraft.name = ''; knowledgeDraft.description = ''; knowledgeDraft.teamId = ''; await reloadKnowledgeBases(); workspaceMessage.value = '知识库已创建' }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '知识库创建失败' }
  finally { workspaceBusy.value = false }
}
async function editKnowledgeBase(item: KnowledgeBase) {
  const name = window.prompt('知识库名称', item.name)?.trim()
  if (!name) return
  const description = window.prompt('知识库说明', item.description)?.trim() ?? item.description
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) }); await reloadKnowledgeBases(); workspaceMessage.value = '知识库已更新'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '知识库更新失败' }
  finally { workspaceBusy.value = false }
}
async function deleteKnowledgeBase(item: KnowledgeBase) {
  if (!window.confirm(`永久删除知识库“${item.name}”？文件本身不会被删除。`)) return
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${item.id}`, { method: 'DELETE' }); await reloadKnowledgeBases(); workspaceMessage.value = '知识库已删除'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '知识库删除失败' }
  finally { workspaceBusy.value = false }
}
function availableKnowledgeAssets(item: KnowledgeBase) {
  const attached = new Set(item.assets.map((entry) => entry.assetId))
  return workspaceAssets.value.filter((asset) => !attached.has(asset.id) && (item.teamId ? asset.teamId === item.teamId : !asset.teamId))
}
async function assignKnowledgeBaseTeam(item: KnowledgeBase) {
  const teamId = knowledgeTeamSelection[item.id] ?? item.teamId ?? ''
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: item.name, description: item.description, teamId: teamId || null }) }); await reloadKnowledgeBases(); workspaceMessage.value = teamId ? '知识库已共享到团队' : '知识库已设为个人资料'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '知识库归属更新失败' }
  finally { workspaceBusy.value = false }
}
async function attachKnowledgeAsset(knowledgeBaseId: string) {
  const assetId = knowledgeAssetSelection[knowledgeBaseId]
  if (!assetId) return
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${knowledgeBaseId}/assets`, { method: 'POST', body: JSON.stringify({ assetId }) }); knowledgeAssetSelection[knowledgeBaseId] = ''; await reloadKnowledgeBases(); workspaceMessage.value = '文件已加入知识库'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '文件添加失败' }
  finally { workspaceBusy.value = false }
}
async function detachKnowledgeAsset(knowledgeBaseId: string, assetId: string) {
  workspaceBusy.value = true
  try { await api(`/knowledge-bases/${knowledgeBaseId}/assets/${assetId}`, { method: 'DELETE' }); await reloadKnowledgeBases(); workspaceMessage.value = '文件已从知识库移除'; workspaceError.value = false }
  catch (reason) { workspaceError.value = true; workspaceMessage.value = reason instanceof Error ? reason.message : '文件移除失败' }
  finally { workspaceBusy.value = false }
}
function toolApprovalText(binding: AssistantToolBinding) {
  if (!binding.tool.requiresApproval) return '可直接使用'
  return ({ PENDING: '等待审批', APPROVED: binding.approval?.expiresAt ? `已批准至 ${formatServerDate(binding.approval.expiresAt)}` : '已批准', REJECTED: '已拒绝' } as Record<string, string>)[binding.approval?.status || ''] || '未申请'
}
async function requestToolApproval(binding: AssistantToolBinding) {
  const reason = window.prompt(`申请“${binding.tool.name}”权限的用途说明`, '')?.trim()
  if (reason === undefined) return
  workspaceBusy.value = true
  try { await api(`/assistants/${binding.assistant.id}/tools/${binding.tool.id}/approval-requests`, { method: 'POST', body: JSON.stringify({ reason }) }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已提交'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请提交失败' }
  finally { workspaceBusy.value = false }
}
async function cancelToolApproval(binding: AssistantToolBinding) {
  if (!binding.approval?.id || !window.confirm('撤回这条待审批申请？')) return
  workspaceBusy.value = true
  try { await api(`/tool-approvals/${binding.approval.id}`, { method: 'DELETE' }); toolApprovals.value = await api<typeof toolApprovals.value>('/tool-approvals'); workspaceMessage.value = '审批申请已撤回'; workspaceError.value = false }
  catch (error) { workspaceError.value = true; workspaceMessage.value = error instanceof Error ? error.message : '审批申请撤回失败' }
  finally { workspaceBusy.value = false }
}
async function startTrial(planId?: string) {
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try { currentSubscription.value = await api<Subscription>('/subscriptions/trial', { method: 'POST', body: JSON.stringify(planId ? { planId } : {}) }); planMessage.value = '免费试用已生效'; await studio.refreshCredits() }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '试用领取失败' }
  finally { planBusy.value = false }
}
async function purchasePlan(plan: SubscriptionPlan) {
  if (!plan.priceCents) { if (plan.trialDays) await startTrial(plan.id); return }
  await openPayment({ orderType: 'SUBSCRIPTION', productId: plan.id, productName: `${plan.name}套餐`, amountCents: plan.effectivePriceCents ?? plan.priceCents })
}
async function continueSubscriptionPayment(order: SubscriptionOrder) {
  await openPayment({ orderType: 'SUBSCRIPTION', productId: order.plan.id, productName: `${order.plan.name}套餐续费`, amountCents: order.amountCents, existingOrderId: order.id })
  const channel = eligiblePaymentChannels.value.find((item) => item.supportedMethods.includes(order.paymentMethod))
  if (channel) { selectedPaymentChannelId.value = channel.id; selectedPaymentMethod.value = order.paymentMethod }
}
async function cancelPendingSubscriptionOrder(order: SubscriptionOrder) {
  if (!window.confirm('取消这笔待支付套餐订单？')) return
  planBusy.value = true
  try { await api(`/subscriptions/orders/${order.id}`, { method: 'DELETE' }); subscriptionOrders.value = await api<SubscriptionOrder[]>('/subscriptions/orders'); renewalAttempts.value = await api<RenewalAttempt[]>('/subscriptions/renewal-attempts'); planMessage.value = '待支付订单已取消' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '订单取消失败' }
  finally { planBusy.value = false }
}
async function purchaseUpgradePlan(plan: SubscriptionPlan) {
  if (!plan.priceCents && plan.trialDays) {
    await startTrial(plan.id)
    if (!planError.value) upgradeOpen.value = false
    return
  }
  upgradeOpen.value = false
  await purchasePlan(plan)
}
async function cancelSubscription() {
  if (!currentSubscription.value || !window.confirm('确认取消当前套餐？')) return
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try { const updated = await api<Subscription & { status: string }>('/subscriptions/cancel', { method: 'POST', body: '{}' }); currentSubscription.value = ['ACTIVE', 'TRIALING'].includes(updated.status) ? updated : null; planMessage.value = updated.cancelAtPeriodEnd ? '已关闭自动续订' : '套餐已取消' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '取消失败' }
  finally { planBusy.value = false }
}
async function toggleRenewal() {
  if (!currentSubscription.value) return
  planBusy.value = true; planMessage.value = ''; planError.value = false
  try {
    currentSubscription.value = await api<Subscription>('/subscriptions/renewal', { method: 'PATCH', body: JSON.stringify({ enabled: !currentSubscription.value.autoRenewEnabled, channelId: selectedRenewalChannelId.value || undefined }) })
    renewalOptions.value = await api<RenewalOptions>('/subscriptions/renewal')
    planMessage.value = currentSubscription.value.autoRenewEnabled ? '到期续费提醒已启用' : '到期续费提醒已关闭'
  } catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '续费设置保存失败' }
  finally { planBusy.value = false }
}
async function saveRenewalChannel() {
  if (!currentSubscription.value?.autoRenewEnabled || !selectedRenewalChannelId.value) return
  planBusy.value = true
  try { currentSubscription.value = await api<Subscription>('/subscriptions/renewal', { method: 'PATCH', body: JSON.stringify({ enabled: true, channelId: selectedRenewalChannelId.value }) }); planMessage.value = '续费渠道已更新' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '续费渠道保存失败' }
  finally { planBusy.value = false }
}
async function saveBillingProfile() {
  billingBusy.value = true; billingMessage.value = ''
  try { Object.assign(billingProfile, await api<BillingProfile>('/billing/profile', { method: 'PATCH', body: JSON.stringify(billingProfile) })); billingMessage.value = '开票资料已保存' }
  catch (reason) { billingMessage.value = reason instanceof Error ? reason.message : '开票资料保存失败' }
  finally { billingBusy.value = false }
}
async function requestInvoice() {
  if (!selectedInvoiceTransactionId.value) return
  billingBusy.value = true; billingMessage.value = ''
  try {
    await api('/billing/invoices', { method: 'POST', body: JSON.stringify({ transactionId: selectedInvoiceTransactionId.value, invoiceType: 'ELECTRONIC_NORMAL' }) })
    ;[invoiceTransactions.value, invoiceRequests.value] = await Promise.all([api<InvoiceTransaction[]>('/billing/invoice-transactions'), api<InvoiceRequest[]>('/billing/invoices')])
    selectedInvoiceTransactionId.value = ''; billingMessage.value = '发票申请已提交'
  } catch (reason) { billingMessage.value = reason instanceof Error ? reason.message : '发票申请失败' }
  finally { billingBusy.value = false }
}
async function cancelInvoiceRequest(item: InvoiceRequest) {
  if (!window.confirm('撤销这条发票申请？')) return
  billingBusy.value = true
  try { await api(`/billing/invoices/${item.id}`, { method: 'DELETE' }); invoiceRequests.value = await api<InvoiceRequest[]>('/billing/invoices'); billingMessage.value = '发票申请已撤销' }
  catch (reason) { billingMessage.value = reason instanceof Error ? reason.message : '撤销失败' }
  finally { billingBusy.value = false }
}
async function requestAccountDeletion() {
  if (!window.confirm('提交账户注销申请？7 天冷静期结束后，个人数据将被永久清除。')) return
  deletionBusy.value = true; deletionMessage.value = ''
  try { accountDeletion.value = await api<DeletionRequest>('/users/me/deletion', { method: 'POST', body: JSON.stringify({ reason: deletionReason.value }) }); deletionMessage.value = '注销申请已提交' }
  catch (reason) { deletionMessage.value = reason instanceof Error ? reason.message : '注销申请失败' }
  finally { deletionBusy.value = false }
}
async function cancelAccountDeletion() {
  deletionBusy.value = true; deletionMessage.value = ''
  try { await api('/users/me/deletion', { method: 'DELETE' }); accountDeletion.value = null; deletionMessage.value = '注销申请已撤销' }
  catch (reason) { deletionMessage.value = reason instanceof Error ? reason.message : '撤销失败' }
  finally { deletionBusy.value = false }
}
async function createRechargeOrder(item: RechargePackage) {
  await openPayment({ orderType: 'RECHARGE', productId: item.id, productName: item.name, amountCents: item.priceCents })
}

async function openPayment(intent: PaymentIntent) {
  paymentIntent.value = intent; paymentTransaction.value = null; paymentError.value = ''; paymentQuote.value = null; selectedCouponId.value = ''
  if (intent.orderType === 'SUBSCRIPTION' && !intent.existingOrderId) await refreshPaymentQuote()
  if (!paymentChannels.value.length) paymentChannels.value = await api<PaymentChannel[]>('/payments/methods').catch(() => [])
  const preferred = paymentChannels.value.find((item) => item.isDefault && item.minAmountCents <= intent.amountCents && (!item.maxAmountCents || item.maxAmountCents >= intent.amountCents)) || paymentChannels.value.find((item) => item.minAmountCents <= intent.amountCents && (!item.maxAmountCents || item.maxAmountCents >= intent.amountCents))
  selectedPaymentChannelId.value = preferred?.id || ''
  selectedPaymentMethod.value = preferred?.supportedMethods[0] || ''
}

function selectPaymentChannel(channel: PaymentChannel) { selectedPaymentChannelId.value = channel.id; if (!selectedPaymentMethod.value || !channel.supportedMethods.includes(selectedPaymentMethod.value)) selectedPaymentMethod.value = channel.supportedMethods[0] || '' }
function closePayment() { window.clearTimeout(paymentPollTimer); paymentIntent.value = null; paymentTransaction.value = null; paymentQuote.value = null; selectedCouponId.value = ''; paymentError.value = '' }

async function refreshPaymentQuote() {
  const intent = paymentIntent.value
  if (!intent || intent.orderType !== 'SUBSCRIPTION' || intent.existingOrderId) return
  paymentBusy.value = true; paymentError.value = ''
  try {
    paymentQuote.value = await api<CommerceQuote>('/commerce/quote', { method: 'POST', body: JSON.stringify({ planId: intent.productId, userCouponId: selectedCouponId.value || undefined }) })
    intent.amountCents = paymentQuote.value.amountCents
    if (!paymentQuote.value.coupon && selectedCouponId.value && paymentQuote.value.couponMessage) selectedCouponId.value = ''
  } catch (reason) { paymentError.value = reason instanceof Error ? reason.message : '优惠价格计算失败' }
  finally { paymentBusy.value = false }
}

async function claimCoupon(template: CouponTemplate) {
  couponBusyId.value = template.id
  try { await api('/commerce/coupons/claim', { method: 'POST', body: JSON.stringify({ templateId: template.id }) }); Object.assign(couponWallet, await api<CouponWallet>('/commerce/coupons')); planMessage.value = '优惠券已领取' }
  catch (reason) { planError.value = true; planMessage.value = reason instanceof Error ? reason.message : '优惠券领取失败' }
  finally { couponBusyId.value = '' }
}

async function confirmCheckout() {
  const intent = paymentIntent.value, channel = selectedPaymentChannel.value
  if (!intent || !channel || !selectedPaymentMethod.value) return
  paymentBusy.value = true; paymentError.value = ''
  const paymentWindow = channel.providerKey === 'MANUAL' ? null : window.open('', '_blank')
  try {
    const order = intent.existingOrderId ? { id: intent.existingOrderId } : intent.orderType === 'SUBSCRIPTION'
      ? await api<{ id: string }>('/subscriptions/orders', { method: 'POST', body: JSON.stringify({ planId: intent.productId, paymentMethod: selectedPaymentMethod.value, userCouponId: selectedCouponId.value || undefined }) })
      : await api<{ id: string }>('/recharge/orders', { method: 'POST', body: JSON.stringify({ packageId: intent.productId, paymentMethod: selectedPaymentMethod.value }) })
    paymentTransaction.value = await api<PaymentTransaction>('/payments/checkout', { method: 'POST', body: JSON.stringify({ orderType: intent.orderType, orderId: order.id, channelId: channel.id, paymentMethod: selectedPaymentMethod.value }) })
    if (paymentTransaction.value.checkoutUrl && paymentWindow) paymentWindow.location.href = paymentTransaction.value.checkoutUrl
    else paymentWindow?.close()
    await refreshOrderHistory(intent.orderType)
    schedulePaymentPoll()
  } catch (reason) { paymentWindow?.close(); paymentError.value = reason instanceof Error ? reason.message : '支付订单创建失败' }
  finally { paymentBusy.value = false }
}

async function refreshPaymentStatus() {
  if (!paymentTransaction.value) return
  paymentBusy.value = true
  try {
    paymentTransaction.value = await api<PaymentTransaction>(`/payments/transactions/${paymentTransaction.value.id}`)
    if (paymentTransaction.value.status === 'COMPLETED' && paymentIntent.value) { await refreshOrderHistory(paymentIntent.value.orderType); await studio.refreshCredits(); currentSubscription.value = await api<Subscription | null>('/subscriptions/me').catch(() => currentSubscription.value); Object.assign(couponWallet, await api<CouponWallet>('/commerce/coupons').catch(() => couponWallet)) }
    if (paymentTransaction.value.status === 'FAILED') paymentError.value = paymentTransaction.value.failureReason || '交易处理失败，请联系管理员'
  } catch (reason) { paymentError.value = reason instanceof Error ? reason.message : '交易状态查询失败' }
  finally { paymentBusy.value = false }
}

function schedulePaymentPoll() {
  window.clearTimeout(paymentPollTimer)
  if (!paymentTransaction.value || ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(paymentTransaction.value.status)) return
  paymentPollTimer = window.setTimeout(async () => { await refreshPaymentStatus(); schedulePaymentPoll() }, 3000)
}

async function refreshOrderHistory(orderType: PaymentIntent['orderType']) {
  if (orderType === 'SUBSCRIPTION') subscriptionOrders.value = await api<SubscriptionOrder[]>('/subscriptions/orders').catch(() => subscriptionOrders.value)
  else rechargeOrders.value = await api<RechargeOrder[]>('/recharge/orders').catch(() => rechargeOrders.value)
}

function openCredentialEditor(item?: ApiCredential) {
  credentialError.value = ''
  credentialEditor.value = item ? { ...item, templateId: item.templateId || '', apiKey: '', expiresAt: item.expiresAt?.slice(0, 10) || '', autoImport: false } : { name: '', templateId: '', providerType: 'NEW_API', baseUrl: '', apiKey: '', apiKeyHint: '', authType: 'BEARER', enabled: true, isDefault: apiCredentials.value.length === 0, priority: 0, weight: 100, expiresAt: '', autoImport: true }
}

function applyCredentialTemplate() {
  if (!credentialEditor.value?.templateId) return
  const template = providerTemplates.value.find((item) => item.id === credentialEditor.value?.templateId)
  if (!template || !credentialEditor.value) return
  credentialEditor.value.providerType = template.type
  credentialEditor.value.authType = template.authType
  if (template.baseUrl) credentialEditor.value.baseUrl = template.baseUrl
  if (!credentialEditor.value.name) credentialEditor.value.name = template.name
}

async function saveCredential() {
  if (!credentialEditor.value) return
  credentialSaving.value = true; credentialError.value = ''
  try {
    const { id, apiKeyHint: _hint, autoImport, ...payload } = credentialEditor.value
    if (!payload.apiKey) delete (payload as Partial<CredentialEditor>).apiKey
    const requestPayload = { ...payload, expiresAt: payload.expiresAt || null }
    const saved = await api<ApiCredential>(id ? `/users/me/api-credentials/${id}` : '/users/me/api-credentials', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(requestPayload) })
    credentialEditor.value = null
    if (autoImport) {
      try {
        const imported = await api<{ imported: number }>(`/users/me/api-credentials/${saved.id}/import-models`, { method: 'POST', body: JSON.stringify({ importAll: true }) })
        message.success(`已自动导入 ${imported.imported} 个可用模型`)
      } catch (reason) {
        message.warning(`密钥已保存，自动识别失败：${reason instanceof Error ? reason.message : '请稍后手动检测'}`)
      }
    }
    const [credentials, models] = await Promise.all([api<ApiCredential[]>('/users/me/api-credentials'), api<PrivateModel[]>('/users/me/private-models')])
    apiCredentials.value = credentials
    privateModels.value = models
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { credentialError.value = reason instanceof Error ? reason.message : 'API 密钥保存失败' }
  finally { credentialSaving.value = false }
}

async function deleteCredential(item: ApiCredential) {
  if (!window.confirm(`确认删除“${item.name}”？`)) return
  try {
    await api(`/users/me/api-credentials/${item.id}`, { method: 'DELETE' })
    const [credentials, models] = await Promise.all([
      api<ApiCredential[]>('/users/me/api-credentials'),
      api<PrivateModel[]>('/users/me/private-models'),
    ])
    apiCredentials.value = credentials
    privateModels.value = models
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { message.error(reason instanceof Error ? reason.message : 'API 密钥删除失败') }
}

async function discoverCredential(item: ApiCredential) {
  credentialCheckingId.value = item.id
  try {
    const imported = await api<{ imported: number; availableModels: string[] }>(`/users/me/api-credentials/${item.id}/import-models`, { method: 'POST', body: JSON.stringify({ importAll: true }) })
    discoveredCredentialModels.value = imported.availableModels
    const [credentials, models] = await Promise.all([api<ApiCredential[]>('/users/me/api-credentials'), api<PrivateModel[]>('/users/me/private-models')])
    apiCredentials.value = credentials
    privateModels.value = models
    message.success(`检测完成，已同步 ${imported.imported} 个模型`)
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) {
    const template = providerTemplates.value.find((entry) => entry.id === item.templateId)
    if (template && !template.supportsDiscovery) {
      discoveredCredentialModels.value = []
      openPrivateModelEditor(undefined, item.id)
      message.info('该渠道不提供模型列表，请手动填写模型 ID')
    } else message.error(reason instanceof Error ? reason.message : '密钥检测失败')
  } finally { credentialCheckingId.value = '' }
}

function openPrivateModelEditor(item?: PrivateModel, credentialId = '', upstreamModel = '') {
  privateModelError.value = ''
  privateModelEditor.value = item ? {
    id: item.id, displayName: item.displayName, description: item.description, capability: item.capability, apiProtocol: item.apiProtocol, routingStrategy: item.routingStrategy, enabled: item.enabled, isDefault: item.isDefault,
    routes: item.routes.map(({ credential: _credential, ...route }) => ({ ...route })),
  } : {
    id: '', displayName: upstreamModel, description: '', capability: 'CHAT', apiProtocol: 'openai', routingStrategy: 'PRIORITY', enabled: true, isDefault: false,
    routes: [{ credentialId: credentialId || apiCredentials.value[0]?.id || '', upstreamModel, enabled: true, priority: 0, weight: 100 }],
  }
}

function addPrivateModelRoute() {
  if (!privateModelEditor.value) return
  privateModelEditor.value.routes.push({ credentialId: apiCredentials.value[0]?.id || '', upstreamModel: '', enabled: true, priority: 0, weight: 100 })
}

async function savePrivateModel() {
  if (!privateModelEditor.value) return
  privateModelSaving.value = true
  privateModelError.value = ''
  try {
    const { id, routes, ...model } = privateModelEditor.value
    if (id) {
      await api(`/users/me/private-models/${id}`, { method: 'PATCH', body: JSON.stringify(model) })
      await api(`/users/me/private-models/${id}/routes`, { method: 'PUT', body: JSON.stringify({ routes }) })
    } else await api('/users/me/private-models', { method: 'POST', body: JSON.stringify({ ...model, routes }) })
    privateModels.value = await api<PrivateModel[]>('/users/me/private-models')
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
    privateModelEditor.value = null
  } catch (reason) { privateModelError.value = reason instanceof Error ? reason.message : '私有模型保存失败' }
  finally { privateModelSaving.value = false }
}

async function deletePrivateModel(item: PrivateModel) {
  if (!window.confirm(`确认删除私有模型“${item.displayName}”？`)) return
  try {
    await api(`/users/me/private-models/${item.id}`, { method: 'DELETE' })
    privateModels.value = privateModels.value.filter((model) => model.id !== item.id)
    document.dispatchEvent(new Event('xinyue:model-catalog-changed'))
  } catch (reason) { message.error(reason instanceof Error ? reason.message : '私有模型删除失败') }
}

function hydrateSettings(value: UserSettingsResponse) {
  settings.appearance = value.appearance === 'light' ? '浅色' : value.appearance === 'system' ? '跟随系统' : '深色'
  settings.language = value.language || 'zh-CN'
  settings.style = value.responseStyle === 'default' ? '默认' : value.responseStyle || settings.style
  settings.detail = value.responseDetail === 'auto' ? '自动判断' : value.responseDetail || settings.detail
  settings.replyLanguage = value.replyLanguage === 'follow' ? '跟随对话' : value.replyLanguage || settings.replyLanguage
  settings.customInstructions = value.customInstructions || ''
  settings.nickname = value.nickname || ''
  settings.occupation = value.occupation || ''
  settings.bio = value.bio || ''
  settings.useMemory = value.useMemory ?? settings.useMemory
  settings.referenceChats = value.referenceChats ?? settings.referenceChats
  settings.notifications = value.notifications ?? settings.notifications
  settings.chatHistoryEnabled = value.chatHistoryEnabled ?? settings.chatHistoryEnabled
  settings.trainingOptOut = value.trainingOptOut ?? settings.trainingOptOut
  settings.temporaryChatDefault = value.temporaryChatDefault ?? settings.temporaryChatDefault
  settings.dataRetentionDays = value.dataRetentionDays ?? settings.dataRetentionDays
  settings.shareUsageAnalytics = value.shareUsageAnalytics ?? settings.shareUsageAnalytics
  if (!studio.currentConversationId) studio.temporaryChat = settings.temporaryChatDefault || !settings.chatHistoryEnabled
}

async function markAllRead() {
  if (!unreadCount.value) return
  await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined)
  const now = new Date().toISOString()
  notifications.value = notifications.value.map((item) => ({ ...item, readAt: item.readAt || now }))
}

function moderationCaseStatus(item: ModerationCase) {
  const status = item.appeal?.status
  if (status === 'PENDING') return '申诉待处理'
  if (status === 'IN_REVIEW') return '申诉复核中'
  if (status === 'APPROVED') return '申诉已通过'
  if (status === 'REJECTED') return '申诉未通过'
  if (status === 'CANCELLED') return '申诉已撤回'
  return item.status === 'APPROVED' ? '审核已通过' : item.status === 'DISMISSED' ? '审核已驳回' : '已拦截'
}

async function submitModerationAppeal(item: ModerationCase) {
  const reason = (appealDrafts[item.id] || '').trim()
  if (reason.length < 10) return
  appealBusyId.value = item.id; appealMessage.value = ''; appealError.value = false
  try {
    await api(`/moderation/events/${item.id}/appeal`, { method: 'POST', body: JSON.stringify({ reason }) })
    moderationCases.value = await api<ModerationCase[]>('/moderation/cases')
    appealDrafts[item.id] = ''
    appealMessage.value = '申诉已提交，复核结果会通过站内通知发送。'
  } catch (error) {
    appealError.value = true; appealMessage.value = error instanceof Error ? error.message : '提交申诉失败'
  } finally { appealBusyId.value = '' }
}

async function cancelModerationAppeal(item: ModerationCase) {
  if (!item.appeal) return
  appealBusyId.value = item.id; appealMessage.value = ''; appealError.value = false
  try {
    await api(`/moderation/appeals/${item.appeal.id}/cancel`, { method: 'PATCH' })
    moderationCases.value = await api<ModerationCase[]>('/moderation/cases')
    appealMessage.value = '申诉已撤回。'
  } catch (error) {
    appealError.value = true; appealMessage.value = error instanceof Error ? error.message : '撤回申诉失败'
  } finally { appealBusyId.value = '' }
}

async function redeemCredits() {
  if (!settings.redeemCode.trim()) return
  redeeming.value = true; redeemMessage.value = ''; redeemError.value = false
  try {
    const result = await api<{ redeemed: boolean; credits?: number }>('/credits/redeem', { method: 'POST', body: JSON.stringify({ code: settings.redeemCode }) })
    if (!result.redeemed) { redeemError.value = true; redeemMessage.value = '兑换码无效或已失效'; return }
    studio.credits += result.credits || 0; redeemMessage.value = `兑换成功，已增加 ${result.credits || 0} 创作点`; settings.redeemCode = ''
    await loadWorkspaceData()
  } catch { redeemError.value = true; redeemMessage.value = '兑换失败，请稍后重试' }
  finally { redeeming.value = false }
}

function copyInvite() {
  if (!inviteInfo.url) return
  navigator.clipboard?.writeText(inviteInfo.url).catch(() => undefined)
  inviteCopied.value = true
  window.setTimeout(() => { inviteCopied.value = false }, 1600)
}

function closeConversationMenu() { conversationMenuId.value = '' }

function openConversationMenu(event: MouseEvent, conversation: ConversationSummary) {
  if (conversationMenuId.value === conversation.id) {
    closeConversationMenu()
    return
  }
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 144
  const menuHeight = 200
  const viewportGap = 8
  const fitsBelow = rect.bottom + menuHeight - 4 <= window.innerHeight - viewportGap
  conversationMenuPosition.left = Math.min(window.innerWidth - menuWidth - viewportGap, Math.max(viewportGap, rect.left - 8))
  conversationMenuPosition.top = fitsBelow
    ? rect.bottom - 4
    : Math.max(viewportGap, rect.top - menuHeight + 4)
  conversationMenuId.value = conversation.id
}

function handleConversationMenuOutside(event: PointerEvent) {
  if (!conversationMenuId.value || conversationMenuElement.value?.contains(event.target as Node)) return
  closeConversationMenu()
}

function handleConversationMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeConversationMenu()
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
}

async function shareConversation(conversation: ConversationSummary) {
  closeConversationMenu()
  conversationActionBusy.value = true
  try {
    const result = await api<{ token: string; sharedAt: string }>(`/conversations/${conversation.id}/share`, { method: 'POST' })
    conversation.sharedAt = Date.parse(result.sharedAt)
    await copyText(`${window.location.origin}/share/${result.token}`)
    message.success('共享链接已复制')
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : '创建共享链接失败')
  } finally {
    conversationActionBusy.value = false
  }
}

async function shareCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await shareConversation(currentConversation.value)
}

async function toggleCurrentConversationPinned() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await toggleConversationPinned(currentConversation.value)
}

async function archiveCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await archiveConversation(currentConversation.value.id)
}

async function deleteCurrentConversation() {
  if (!currentConversation.value) return
  chatActionsOpen.value = false
  await deleteConversation(currentConversation.value)
}

async function toggleConversationPinned(conversation: ConversationSummary) {
  closeConversationMenu()
  conversationActionBusy.value = true
  const pinned = !conversation.pinnedAt
  try {
    await studio.setConversationPinned(conversation.id, pinned)
    message.success(pinned ? '已置顶聊天' : '已取消置顶')
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : '置顶状态更新失败')
  } finally {
    conversationActionBusy.value = false
  }
}

async function openConversation(conversationId: string) {
  mobileOpen.value = false
  const loading = studio.openConversation(conversationId).catch(() => undefined)
  await router.push('/chat')
  await loading
  if (studio.currentConversationId === conversationId) void studio.resumeCurrentChat()
}
function startConversationRename(conversation: { id: string; title: string }) {
  closeConversationMenu()
  renamingConversationId.value = conversation.id
  conversationRename.value = conversation.title
}
function cancelConversationRename() {
  if (conversationRenameBusy.value) return
  renamingConversationId.value = ''
  conversationRename.value = ''
}
async function saveConversationRename(conversationId: string) {
  if (!conversationRename.value.trim() || conversationRenameBusy.value) return
  conversationRenameBusy.value = true
  try {
    await studio.renameConversation(conversationId, conversationRename.value)
    renamingConversationId.value = ''
    conversationRename.value = ''
    message.success('对话名称已更新')
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : '对话重命名失败')
  } finally {
    conversationRenameBusy.value = false
  }
}
async function archiveConversation(conversationId: string) {
  closeConversationMenu()
  try { await studio.archiveConversation(conversationId); message.success('对话已归档') }
  catch (reason) { message.error(reason instanceof Error ? reason.message : '归档失败') }
}
function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
async function deleteConversation(conversation: { id: string; title: string }) {
  closeConversationMenu()
  if (!window.confirm(`永久删除“${conversation.title}”？此操作无法撤销。`)) return
  try { await studio.deleteConversation(conversation.id); message.success('对话已删除') }
  catch (reason) { message.error(reason instanceof Error ? reason.message : '对话删除失败') }
}
async function exportAccountData() {
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try {
    const payload = await api<Record<string, unknown>>('/conversations/export')
    downloadText(`flux-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8')
    dataActionMessage.value = '账户数据已导出'
  } catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '数据导出失败' }
  finally { dataActionBusy.value = false }
}
async function clearConversationHistory() {
  if (!window.confirm('永久删除全部聊天记录？此操作无法撤销。')) return
  dataActionBusy.value = true; dataActionMessage.value = ''; dataActionError.value = false
  try { await studio.clearConversations(); dataActionMessage.value = '全部聊天记录已删除' }
  catch (reason) { dataActionError.value = true; dataActionMessage.value = reason instanceof Error ? reason.message : '聊天记录删除失败' }
  finally { dataActionBusy.value = false }
}
function formatServerDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }

async function logout() {
  await auth.signOut()
  studio.clearWorkspace()
  accountOpen.value = false
  await router.push('/')
}

const externalIconMap: Record<string, Component> = { code: Code2, 'book-open': BookOpen, webhook: Webhook, 'key-round': KeyRound, 'life-buoy': LifeBuoy, 'external-link': ExternalLink }
const navItems = computed<WorkspaceNavItem[]>(() => [
  { key: 'chat', mode: 'chat', label: t('workspace.newChat'), icon: SquarePen, to: '/chat', external: false, openNewTab: false },
  ...(publicSettings.sidebarCreationEnabled ? [{ key: 'creation', mode: 'images' as const, activeModes: ['images', 'videos'] as StudioMode[], label: t('workspace.creation'), icon: ImageIcon, to: '/image', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarCommerceEnabled ? [{ key: 'commerce', mode: 'commerce' as const, label: t('workspace.commerce'), icon: ShoppingBag, to: '/commerce', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarOfficeEnabled ? [{ key: 'office', mode: 'office' as const, label: t('workspace.office'), icon: BriefcaseBusiness, to: '/office', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarPromptsEnabled ? [{ key: 'prompts', mode: 'prompts' as const, label: t('workspace.prompts'), icon: LibraryBig, to: '/prompts', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarPluginsEnabled ? [{ key: 'plugins', mode: 'plugins' as const, label: '能力中心', icon: Blocks, to: '/capabilities', external: false, openNewTab: false }] : []),
  ...(publicSettings.sidebarProjectsEnabled || publicSettings.sidebarAssetsEnabled ? [{ key: 'workspace', mode: 'workspace' as const, label: '工作空间', icon: FolderKanban, to: '/workspace', external: false, openNewTab: false }] : []),
  ...externalLinks.value.map((item) => ({ key: `external-${item.key}`, mode: 'api' as const, label: item.name, icon: externalIconMap[item.icon] || ExternalLink, to: item.url, external: true, openNewTab: item.openNewTab })),
])
</script>
