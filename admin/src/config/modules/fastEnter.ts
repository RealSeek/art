import type { FastEnterConfig } from '@/types/config'

const fastEnterConfig: FastEnterConfig = {
  minWidth: 1200,
  applications: [
    {
      name: '工作台',
      description: '经营数据与待办概览',
      icon: 'ri:dashboard-line',
      iconColor: '#397157',
      enabled: true,
      order: 1,
      routeName: 'Console'
    },
    {
      name: '分析页',
      description: '用量、成本和渠道表现',
      icon: 'ri:bar-chart-box-line',
      iconColor: '#2563eb',
      enabled: true,
      order: 2,
      routeName: 'Analysis'
    },
    {
      name: '客户管理',
      description: '账户、状态与用户分组',
      icon: 'ri:user-line',
      iconColor: '#2563eb',
      enabled: true,
      order: 3,
      routeName: 'CustomerUsers'
    },
    {
      name: '模型与定价',
      description: '模型目录和计费规则',
      icon: 'ri:robot-2-line',
      iconColor: '#7c3aed',
      enabled: true,
      order: 4,
      routeName: 'ModelCatalog'
    },
    {
      name: '关于我们',
      description: '站点内容与说明管理',
      icon: 'ri:file-text-line',
      iconColor: '#475569',
      enabled: true,
      order: 5,
      routeName: 'ArticleList'
    }
  ],
  quickLinks: [
    { name: '客户管理', enabled: true, order: 1, routeName: 'CustomerUsers' },
    { name: '生成任务', enabled: true, order: 2, routeName: 'GenerationJobs' },
    { name: '内容审核', enabled: true, order: 3, routeName: 'ModerationEvents' },
    { name: '审计日志', enabled: true, order: 4, routeName: 'AuditLogs' },
    { name: '业务系统配置', enabled: true, order: 5, routeName: 'XinyueSystemSettings' }
  ]
}

export default Object.freeze(fastEnterConfig)
