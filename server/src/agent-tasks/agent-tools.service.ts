import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'

export type AgentToolDescriptor = {
  id?: string
  key: string
  name: string
  description: string
  requiresApproval: boolean
  kind: 'builtin' | 'external'
}

type ToolExecutionTask = { id: string; userId: string; assistantId: string | null; projectId: string | null }

@Injectable()
export class AgentToolsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly crypto: CredentialCryptoService) {}

  async available(task: ToolExecutionTask): Promise<AgentToolDescriptor[]> {
    const tools: AgentToolDescriptor[] = [
      { key: 'knowledge_search', name: '知识库检索', description: '从用户已授权的知识库中检索事实、文档片段和内部资料', requiresApproval: false, kind: 'builtin' },
      { key: 'project_context', name: '项目上下文', description: '读取当前项目的目标、说明、工作流状态、版本记录和项目文件摘要', requiresApproval: false, kind: 'builtin' },
      { key: 'file_catalog', name: '文件目录', description: '按名称、类型或项目筛选用户文件，返回可用于后续办公任务的文件元数据', requiresApproval: false, kind: 'builtin' },
      { key: 'data_summary', name: '数据汇总', description: '对输入的数字数组或表格行执行计数、合计、均值、最小值和最大值计算', requiresApproval: false, kind: 'builtin' },
      { key: 'current_time', name: '日期与时间', description: '获取当前服务器日期、时间和时区', requiresApproval: false, kind: 'builtin' },
    ]
    const searchEndpoint = this.config.get<string>('WEB_SEARCH_ENDPOINT') || ''
    const searchApiKey = this.config.get<string>('WEB_SEARCH_API_KEY') || ''
    if (searchApiKey || searchEndpoint && !searchEndpoint.includes('api.tavily.com')) {
      tools.push({ key: 'web_search', name: '网页搜索', description: '检索公开网页并返回标题、链接和摘要，适合需要最新外部资料的任务', requiresApproval: false, kind: 'builtin' })
    }
    if (!task.assistantId) return tools
    const bindings = await this.prisma.assistantTool.findMany({
      where: { assistantId: task.assistantId, tool: { enabled: true } },
      include: { tool: true },
    })
    return [...tools, ...bindings.map(({ tool }) => ({ id: tool.id, key: tool.key, name: tool.name, description: tool.description, requiresApproval: tool.requiresApproval, kind: 'external' as const }))]
  }

  async execute(task: ToolExecutionTask, tool: AgentToolDescriptor, input: Record<string, unknown>, executionKey?: string) {
    if (tool.key === 'knowledge_search') return this.knowledgeSearch(task, String(input.query || input.q || ''))
    if (tool.key === 'web_search') return this.webSearch(String(input.query || input.q || ''))
    if (tool.key === 'project_context') return this.projectContext(task)
    if (tool.key === 'file_catalog') return this.fileCatalog(task, input)
    if (tool.key === 'data_summary') return this.dataSummary(input)
    if (tool.key === 'current_time') return { iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    if (!tool.id) throw new Error('工具配置不存在')
    const configured = await this.prisma.toolDefinition.findFirst({ where: { id: tool.id, enabled: true } })
    if (!configured?.endpoint) throw new Error('工具尚未配置 Endpoint')
    this.validateInput(input, configured.inputSchema)
    const started = Date.now()
    let status = 'FAILED'
    let output = ''
    let error = ''
    try {
      const method = configured.httpMethod.toUpperCase()
      const publicHeaders = this.record(configured.headers)
      const secretHeaders = configured.encryptedHeaders ? this.record(JSON.parse(this.crypto.decrypt(configured.encryptedHeaders))) : {}
      const url = new URL(configured.endpoint)
      if (method === 'GET' || method === 'DELETE') Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== null) url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value)) })
      const response = await fetch(url, {
        method,
        headers: { ...publicHeaders, ...secretHeaders, 'Content-Type': publicHeaders['Content-Type'] || publicHeaders['content-type'] || 'application/json', ...(executionKey ? { 'Idempotency-Key': executionKey } : {}) },
        ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(input) }),
        signal: AbortSignal.timeout(Math.min(120_000, Math.max(1000, configured.timeoutMs))),
      })
      output = (await response.text()).slice(0, 100_000)
      if (!response.ok) throw new Error(`工具返回 ${response.status}`)
      status = 'SUCCEEDED'
    } catch (reason) {
      error = reason instanceof Error ? reason.message : '工具调用失败'
    }
    await this.prisma.toolCallAudit.create({
      data: {
        userId: task.userId,
        toolId: configured.id,
        assistantId: task.assistantId,
        status,
        input: this.json(input),
        output: output ? this.json({ text: output }) : undefined,
        error: error || null,
        durationMs: Date.now() - started,
      },
    })
    if (status === 'FAILED') throw new Error(error || '工具调用失败')
    try { return JSON.parse(output) as unknown } catch { return { text: output } }
  }

  private async knowledgeSearch(task: ToolExecutionTask, query: string) {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return { results: [], message: '检索词为空' }
    const assets = await this.prisma.knowledgeBaseAsset.findMany({
      where: task.assistantId
        ? { knowledgeBase: { assistants: { some: { assistantId: task.assistantId } } } }
        : { knowledgeBase: { creatorId: task.userId } },
      include: { knowledgeBase: { select: { id: true, name: true } }, asset: { select: { id: true, name: true } } },
      take: 100,
    })
    const terms = [...new Set(normalized.split(/[\s,，。；;:：!?！？]+/).filter((term) => term.length > 1))].slice(0, 12)
    const scored = assets.map((item) => {
      const text = item.extractedText || ''
      const lower = text.toLowerCase()
      const hits = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0)
      const first = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0
      const start = Math.max(0, first - 240)
      return { score: hits, knowledgeBase: item.knowledgeBase.name, file: item.asset.name, assetId: item.asset.id, excerpt: text.slice(start, start + 1800) }
    }).filter((item) => item.score > 0 || !terms.length).sort((a, b) => b.score - a.score).slice(0, 8)
    return { query, results: scored }
  }

  private async projectContext(task: ToolExecutionTask) {
    if (!task.projectId) return { project: null, message: '当前任务未关联项目' }
    const project = await this.prisma.project.findFirst({
      where: { id: task.projectId, userId: task.userId, archivedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        instructions: true,
        workflowStatus: true,
        revision: true,
        updatedAt: true,
        versions: { orderBy: { version: 'desc' }, take: 5, select: { version: true, label: true, changeSummary: true, createdAt: true } },
        assets: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, name: true, kind: true, mimeType: true, size: true, createdAt: true } },
      },
    })
    if (!project) return { project: null, message: '项目不存在或已归档' }
    return { ...project, assets: project.assets.map((asset) => ({ ...asset, size: Number(asset.size) })) }
  }

  private async fileCatalog(task: ToolExecutionTask, input: Record<string, unknown>) {
    const query = String(input.query || input.name || '').trim()
    const kind = String(input.kind || '').trim().toUpperCase()
    const allowedKinds = new Set(['IMAGE', 'VIDEO', 'FILE'])
    const assets = await this.prisma.asset.findMany({
      where: {
        userId: task.userId,
        deletedAt: null,
        ...(task.projectId && input.allProjects !== true ? { OR: [{ projectId: task.projectId }, { projectId: null }] } : {}),
        ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
        ...(allowedKinds.has(kind) ? { kind: kind as 'IMAGE' | 'VIDEO' | 'FILE' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, projectId: true, kind: true, name: true, mimeType: true, size: true, width: true, height: true, metadata: true, createdAt: true },
    })
    return { query, count: assets.length, files: assets.map((asset) => ({ ...asset, size: Number(asset.size) })) }
  }

  private dataSummary(input: Record<string, unknown>) {
    const raw = Array.isArray(input.values)
      ? input.values
      : Array.isArray(input.rows)
        ? input.rows.flatMap((row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.values(row as Record<string, unknown>) : [])
        : []
    const values = raw.map((value) => typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))).filter(Number.isFinite).slice(0, 20_000)
    if (!values.length) return { count: 0, message: '未找到可计算的数字，请通过 values 或 rows 传入数据' }
    const sum = values.reduce((total, value) => total + value, 0)
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    return { count: values.length, sum, average: sum / values.length, median, min: sorted[0], max: sorted[sorted.length - 1] }
  }

  private async webSearch(query: string) {
    if (!query.trim()) return { results: [], message: '搜索词为空' }
    const endpoint = this.config.get<string>('WEB_SEARCH_ENDPOINT') || 'https://api.tavily.com/search'
    const apiKey = this.config.get<string>('WEB_SEARCH_API_KEY') || ''
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ query, max_results: 8, search_depth: 'advanced', include_answer: true, ...(apiKey ? { api_key: apiKey } : {}) }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`网页搜索服务返回 ${response.status}`)
    const payload = await response.json() as Record<string, unknown>
    const raw = Array.isArray(payload.results) ? payload.results : Array.isArray(payload.data) ? payload.data : []
    return {
      query,
      answer: typeof payload.answer === 'string' ? payload.answer : undefined,
      results: raw.slice(0, 8).map((item) => {
        const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
        return { title: String(row.title || ''), url: String(row.url || row.link || ''), content: String(row.content || row.snippet || row.description || '').slice(0, 3000) }
      }),
    }
  }

  json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  }

  private record(value: Prisma.JsonValue | null): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string')) as Record<string, string>
  }

  private validateInput(input: Record<string, unknown>, schema: Prisma.JsonValue | null) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
    const definition = schema as Record<string, unknown>
    const required = Array.isArray(definition.required) ? definition.required.filter((item): item is string => typeof item === 'string') : []
    const missing = required.filter((key) => input[key] === undefined || input[key] === null || input[key] === '')
    if (missing.length) throw new Error(`工具参数缺少必填字段：${missing.join('、')}`)
    const properties = definition.properties && typeof definition.properties === 'object' && !Array.isArray(definition.properties) ? definition.properties as Record<string, unknown> : {}
    for (const [key, value] of Object.entries(input)) {
      const property = properties[key]
      if (!property || typeof property !== 'object' || Array.isArray(property)) continue
      const type = String((property as Record<string, unknown>).type || '')
      const valid = !type || type === 'array' && Array.isArray(value) || type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value) || type === 'string' && typeof value === 'string' || type === 'number' && typeof value === 'number' || type === 'integer' && Number.isInteger(value) || type === 'boolean' && typeof value === 'boolean'
      if (!valid) throw new Error(`工具参数 ${key} 类型应为 ${type}`)
    }
  }
}
