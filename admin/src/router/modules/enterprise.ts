import { AppRouteRecord } from '@/types/router'

const resource = (title: string, icon: string, key: string) => ({
  title: `xinyue.nav.${key}`,
  icon,
  keepAlive: true,
  roles: ['R_SUPER', 'R_ADMIN'],
  resource: key
})

// 企业后台最多保留两级：一级业务分组，二级具体页面。
export const enterpriseRoutes: AppRouteRecord[] = [
  {
    path: '/enterprise/customers',
    name: 'EnterpriseCustomers',
    component: '/index/index',
    meta: { title: 'xinyue.nav.customers', icon: 'ri:team-line', roles: ['R_SUPER', 'R_ADMIN'] },
    children: [
      {
        path: 'users',
        name: 'CustomerUsers',
        component: '/xinyue/users',
        meta: resource('客户管理', 'ri:user-line', 'users')
      },
      {
        path: 'groups',
        name: 'CustomerGroups',
        component: '/xinyue/groups',
        meta: resource('用户分组', 'ri:group-line', 'groups')
      },
      {
        path: 'credits',
        name: 'CreditLedger',
        component: '/xinyue/operations',
        meta: resource('额度流水', 'ri:coins-line', 'credits')
      }
    ]
  },
  {
    path: '/enterprise/ai',
    name: 'EnterpriseAI',
    component: '/index/index',
    meta: { title: 'xinyue.nav.ai', icon: 'ri:brain-line', roles: ['R_SUPER', 'R_ADMIN'] },
    children: [
      {
        path: 'providers',
        name: 'ProviderChannels',
        component: '/xinyue/providers',
        meta: resource('上游渠道', 'ri:server-line', 'providers')
      },
      {
        path: 'models',
        name: 'ModelCatalog',
        component: '/xinyue/models',
        meta: resource('模型与定价', 'ri:robot-2-line', 'models')
      },
      {
        path: 'jobs',
        name: 'GenerationJobs',
        component: '/xinyue/operations',
        meta: resource('生成任务', 'ri:task-line', 'jobs')
      },
      {
        path: 'assets',
        name: 'AssetLibrary',
        component: '/xinyue/operations',
        meta: resource('文件与资产', 'ri:image-line', 'assets')
      },
      {
        path: 'projects',
        name: 'ProjectWorkflowAudits',
        component: '/xinyue/operations',
        meta: resource('项目与工作流', 'ri:git-branch-line', 'projects')
      },
      {
        path: 'inspirations',
        name: 'InspirationManagement',
        component: '/xinyue/operations',
        meta: resource('灵感内容', 'ri:lightbulb-line', 'inspirations')
      },
      {
        path: 'prompt-templates',
        name: 'PromptTemplateManagement',
        component: '/xinyue/operations',
        meta: resource('提示词模板', 'ri:file-text-line', 'promptTemplates')
      },
      {
        path: 'prompt-library',
        name: 'PromptLibraryManagement',
        component: '/xinyue/operations',
        meta: resource('提示词库', 'ri:book-open-line', 'promptLibrary')
      },
      {
        path: 'plugins',
        name: 'PluginManagement',
        component: '/xinyue/operations',
        meta: resource('插件管理', 'ri:apps-2-line', 'plugins')
      },
      {
        path: 'plugin-categories',
        name: 'PluginCategoryManagement',
        component: '/xinyue/operations',
        meta: resource('插件分类', 'ri:folder-settings-line', 'pluginCategories')
      },
      {
        path: 'assistants',
        name: 'AssistantManagement',
        component: '/xinyue/operations',
        meta: resource('AI 助手', 'ri:sparkling-2-line', 'assistants')
      },
      {
        path: 'tools',
        name: 'ToolManagement',
        component: '/xinyue/operations',
        meta: resource('工具与审批', 'ri:tools-line', 'tools')
      },
      {
        path: 'tool-approvals',
        name: 'ToolApprovalManagement',
        component: '/xinyue/operations',
        meta: resource('审批申请', 'ri:shield-check-line', 'toolApprovals')
      },
      {
        path: 'knowledge-bases',
        name: 'KnowledgeBaseManagement',
        component: '/xinyue/operations',
        meta: resource('知识库', 'ri:database-2-line', 'knowledgeBases')
      },
      {
        path: 'external-links',
        name: 'ExternalLinks',
        component: '/xinyue/operations',
        meta: resource('外部入口', 'ri:external-link-line', 'externalLinks')
      }
    ]
  },
  {
    path: '/enterprise/commerce',
    name: 'EnterpriseCommerce',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.commerce',
      icon: 'ri:bank-card-line',
      roles: ['R_SUPER', 'R_ADMIN']
    },
    children: [
      {
        path: 'subscriptions',
        name: 'SubscriptionManagement',
        component: '/xinyue/subscriptions',
        meta: resource('订阅与套餐', 'ri:vip-crown-2-line', 'subscriptions')
      },
      {
        path: 'payments',
        name: 'PaymentManagement',
        component: '/xinyue/commerce',
        meta: resource('充值与支付', 'ri:secure-payment-line', 'payments')
      }
    ]
  },
  {
    path: '/enterprise/operations',
    name: 'EnterpriseOperations',
    component: '/index/index',
    meta: {
      title: 'xinyue.nav.operations',
      icon: 'ri:shield-check-line',
      roles: ['R_SUPER', 'R_ADMIN']
    },
    children: [
      {
        path: 'announcements',
        name: 'AnnouncementManagement',
        component: '/xinyue/operations',
        meta: resource('公告管理', 'ri:notification-3-line', 'announcements')
      },
      {
        path: 'moderation-rules',
        name: 'ModerationRules',
        component: '/xinyue/operations',
        meta: resource('审核规则', 'ri:filter-3-line', 'moderationRules')
      },
      {
        path: 'moderation',
        name: 'ModerationEvents',
        component: '/xinyue/operations',
        meta: resource('内容审核', 'ri:shield-keyhole-line', 'moderation')
      },
      {
        path: 'support',
        name: 'SupportTickets',
        component: '/xinyue/operations',
        meta: resource('客服工单', 'ri:customer-service-2-line', 'support')
      },
      {
        path: 'alerts',
        name: 'AlertCenter',
        component: '/xinyue/operations',
        meta: resource('告警中心', 'ri:alarm-warning-line', 'alerts')
      },
      {
        path: 'alert-rules',
        name: 'AlertRules',
        component: '/xinyue/operations',
        meta: resource('告警规则', 'ri:equalizer-2-line', 'alertRules')
      },
      {
        path: 'logins',
        name: 'LoginSessions',
        component: '/xinyue/operations',
        meta: resource('登录会话', 'ri:login-circle-line', 'logins')
      },
      {
        path: 'audits',
        name: 'AuditLogs',
        component: '/xinyue/operations',
        meta: resource('审计日志', 'ri:file-list-3-line', 'audits')
      },
      {
        path: 'tool-calls',
        name: 'ToolCallAudits',
        component: '/xinyue/operations',
        meta: resource('工具调用记录', 'ri:terminal-box-line', 'toolCalls')
      },
      {
        path: 'system-health',
        name: 'XinyueSystemHealth',
        component: '/safeguard/server',
        meta: resource('系统健康', 'ri:pulse-line', 'systemHealth')
      }
    ]
  },
  {
    path: '/enterprise/settings',
    name: 'XinyueSystemSettings',
    component: '/xinyue/settings',
    meta: {
      title: 'xinyue.nav.settings',
      icon: 'ri:settings-3-line',
      keepAlive: true,
      roles: ['R_SUPER']
    }
  }
]
