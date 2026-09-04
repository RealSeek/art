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

const ADMIN_ROUTE_RESOURCES: Readonly<Record<string, string>> = {
  'account-deletions': 'operations',
  agent: 'agent',
  alerts: 'operations',
  announcements: 'operations',
  assets: 'workspace',
  assistants: 'agent',
  audits: 'operations',
  byok: 'billing',
  'capability-registry': 'settings',
  commerce: 'billing',
  'content-pages': 'content',
  credits: 'customers',
  'external-links': 'workspace',
  'feature-flags': 'settings',
  finance: 'billing',
  generations: 'models',
  groups: 'customers',
  health: 'dashboard',
  'image-tools': 'content',
  inspirations: 'content',
  invoices: 'billing',
  jobs: 'models',
  'knowledge-bases': 'agent',
  logins: 'operations',
  model: 'models',
  'model-presets': 'models',
  'model-pricing': 'models',
  'model-vendors': 'models',
  models: 'models',
  moderation: 'operations',
  notifications: 'operations',
  'new-api': 'settings',
  overview: 'dashboard',
  payments: 'billing',
  'plugin-categories': 'agent',
  plugins: 'agent',
  prompt: 'content',
  'prompt-library': 'content',
  'prompt-templates': 'content',
  projects: 'workspace',
  providers: 'models',
  'provider-templates': 'models',
  'recharge-packages': 'billing',
  recharge: 'billing',
  'redemption-codes': 'billing',
  referrals: 'billing',
  roles: 'roles',
  settings: 'settings',
  storage: 'workspace',
  subscriptions: 'billing',
  support: 'operations',
  system: 'operations',
  'system-settings': 'settings',
  teams: 'customers',
  'token-billing': 'billing',
  'tool-approval-requests': 'agent',
  'tool-calls': 'operations',
  tools: 'agent',
  'usage-report': 'dashboard',
  users: 'customers',
  'web-search-channels': 'agent',
  works: 'content',
}

const KNOWN_ADMIN_PERMISSIONS = new Set(ADMIN_PERMISSION_CATALOG.map((item) => item.code))

export function permissionForAdminRequest(url: string, method: string): string | null {
  const path = adminPathForUrl(url)
  if (path === null) return null
  const resource = ADMIN_ROUTE_RESOURCES[path.split('/', 1)[0]]
  if (!resource) return null
  return `${resource}.${isReadMethod(method) ? 'read' : 'write'}`
}

export function isKnownAdminPermission(permission: string) {
  return KNOWN_ADMIN_PERMISSIONS.has(permission)
}

function isReadMethod(method: string) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
}

function adminPathForUrl(url: string) {
  const pathname = url.split(/[?#]/, 1)[0].replace(/^\/+/, '')
  const unversioned = pathname.startsWith('v1/') ? pathname.slice(3) : pathname
  if (!unversioned.startsWith('admin/')) return null
  return unversioned.slice('admin/'.length)
}
