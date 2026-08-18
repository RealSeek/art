export const ADMIN_RESOURCES = [
  ['dashboard', '仪表盘'],
  ['customers', '客户与组织'],
  ['models', '模型与生成'],
  ['content', '内容中心'],
  ['agent', 'Agent 与能力'],
  ['workspace', '工作空间'],
  ['billing', '订阅与支付'],
  ['operations', '运营与风控'],
  ['settings', '站点与系统'],
] as const

export const ADMIN_PERMISSION_CATALOG = [
  { code: 'admin.access', name: '进入管理后台', group: '后台访问' },
  ...ADMIN_RESOURCES.flatMap(([resource, name]) => [
    { code: `${resource}.read`, name: `查看${name}`, group: name },
    { code: `${resource}.write`, name: `管理${name}`, group: name },
  ]),
  { code: 'roles.read', name: '查看后台角色', group: '后台权限' },
  { code: 'roles.write', name: '管理后台角色', group: '后台权限' },
]

export function permissionForAdminRequest(url: string, method: string) {
  const path = url.split('?', 1)[0].replace(/^\/v1\/admin\/?/, '')
  const resource = resourceForPath(path)
  if (!resource) return 'admin.access'
  return `${resource}.${isReadMethod(method) ? 'read' : 'write'}`
}

function isReadMethod(method: string) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
}

function resourceForPath(path: string) {
  if (/^(roles|administrators)(\/|$)/.test(path)) return 'roles'
  if (/^(overview|usage-report)(\/|$)/.test(path)) return 'dashboard'
  if (/^(users|groups|credits|teams)(\/|$)/.test(path)) return 'customers'
  if (/^(providers|provider-templates|model|models|jobs|generations)(\/|$)/.test(path)) return 'models'
  if (/^(content-pages|inspirations|image-tools|prompt)(\/|$)/.test(path)) return 'content'
  if (/^(agent|assistants|plugins|tools|tool-approvals|knowledge-bases|web-search)(\/|$)/.test(path)) return 'agent'
  if (/^(assets|projects|external-links|storage)(\/|$)/.test(path)) return 'workspace'
  if (/^(subscriptions|payments|recharge|redemption-codes|finance|byok|invoices|referrals)(\/|$)/.test(path)) return 'billing'
  if (/^(system-settings|settings)(\/|$)/.test(path)) return 'settings'
  if (/^(announcements|notifications|moderation|support|alerts|logins|audits|system|tool-calls|account-deletions)(\/|$)/.test(path)) return 'operations'
  return null
}
