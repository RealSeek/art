import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { ResourceAccessService } from '../common/resource-access.service'
import { PrismaService } from '../prisma/prisma.service'

type CreateCanvasInput = {
  title: string
  projectId?: string
  kind?: 'FREEFORM' | 'SHORT_DRAMA'
  document?: Record<string, unknown>
}

type UpdateCanvasInput = {
  expectedRevision: number
  title?: string
  document?: Record<string, unknown>
  archived?: boolean
}

const NODE_TYPES = new Set(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'GROUP', 'CONFIG'])
const MAX_DOCUMENT_BYTES = 2_000_000
const MAX_NODES = 500
const MAX_EDGES = 1_000
type CanvasPlanRules = { canvasAccess: boolean; shortDramaAccess: boolean; maxCanvases: number; maxCanvasNodes: number }

@Injectable()
export class CanvasesService {
  constructor(private readonly prisma: PrismaService, private readonly access: ResourceAccessService) {}

  private whereReadable(userId: string): Prisma.CanvasDocumentWhereInput {
    return { OR: [{ userId }, { project: { is: this.access.projectWhere(userId) } }] }
  }

  private defaultDocument(kind: 'FREEFORM' | 'SHORT_DRAMA' = 'FREEFORM'): Prisma.InputJsonObject {
    if (kind === 'SHORT_DRAMA') return this.defaultShortDramaDocument()
    return {
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      background: 'lines',
      nodes: [],
      edges: [],
    }
  }

  private defaultShortDramaDocument(): Prisma.InputJsonObject {
    const group = (id: string, title: string, x: number, width: number, stage: string) => ({
      id, type: 'GROUP', title, position: { x, y: 0 }, size: { width, height: 720 },
      data: { kind: 'GROUP', title, content: '', dramaRole: 'STAGE', dramaStage: stage },
    })
    return {
      version: 1,
      viewport: { x: 60, y: 100, zoom: 0.82 },
      background: 'dots',
      nodes: [
        group('drama-stage-script', '01 剧本', 0, 520, 'SCRIPT'),
        group('drama-stage-assets', '02 角色与场景', 600, 760, 'ASSETS'),
        group('drama-stage-storyboard', '03 分镜', 1440, 760, 'STORYBOARD'),
        group('drama-stage-production', '04 成片', 2280, 760, 'PRODUCTION'),
        {
          id: 'drama-script', type: 'TEXT', title: '剧本原文', position: { x: 40, y: 78 }, size: { width: 440, height: 570 },
          data: { kind: 'TEXT', title: '剧本原文', content: '', dramaRole: 'SCRIPT', dramaStage: 'SCRIPT' },
        },
        {
          id: 'drama-characters', type: 'TEXT', title: '角色设定', position: { x: 640, y: 78 }, size: { width: 320, height: 270 },
          data: { kind: 'TEXT', title: '角色设定', content: '', dramaRole: 'CHARACTER', dramaStage: 'ASSETS' },
        },
        {
          id: 'drama-scenes', type: 'TEXT', title: '场景设定', position: { x: 1000, y: 78 }, size: { width: 320, height: 270 },
          data: { kind: 'TEXT', title: '场景设定', content: '', dramaRole: 'SCENE', dramaStage: 'ASSETS' },
        },
        {
          id: 'drama-props', type: 'TEXT', title: '关键道具', position: { x: 640, y: 390 }, size: { width: 320, height: 220 },
          data: { kind: 'TEXT', title: '关键道具', content: '', dramaRole: 'PROP', dramaStage: 'ASSETS' },
        },
      ],
      edges: [],
    }
  }

  async list(userId: string, archived = false, query?: string) {
    const rows = await this.prisma.canvasDocument.findMany({
      where: {
        ...this.whereReadable(userId),
        archivedAt: archived ? { not: null } : null,
        title: query?.trim() ? { contains: query.trim(), mode: 'insensitive' } : undefined,
      },
      orderBy: { updatedAt: 'desc' },
      include: { project: { select: { id: true, name: true, teamId: true } } },
    })
    return rows.map((row) => ({
      ...row,
      document: undefined,
      nodeCount: this.documentCount(row.document, 'nodes'),
      edgeCount: this.documentCount(row.document, 'edges'),
      accessRole: row.userId === userId ? 'OWNER' : 'MEMBER',
    }))
  }

  async capabilities(userId: string) {
    const [rules, usedCanvases] = await Promise.all([this.planRules(userId), this.prisma.canvasDocument.count({ where: { userId } })])
    return { ...rules, usedCanvases }
  }

  async create(userId: string, input: CreateCanvasInput) {
    const rules = await this.planRules(userId)
    if (!rules.canvasAccess) throw new ForbiddenException('当前套餐未开放无限画布')
    if (input.kind === 'SHORT_DRAMA' && !rules.shortDramaAccess) throw new ForbiddenException('当前套餐未开放短剧工作流')
    const usedCanvases = await this.prisma.canvasDocument.count({ where: { userId } })
    if (usedCanvases >= rules.maxCanvases) throw new ForbiddenException(`当前套餐最多创建 ${rules.maxCanvases} 个画布`)
    if (input.projectId) await this.access.projectAccess(userId, input.projectId, false)
    return this.prisma.canvasDocument.create({
      data: {
        userId,
        projectId: input.projectId || null,
        title: input.title.trim(),
        kind: input.kind || 'FREEFORM',
        document: input.document ? this.sanitizeDocument(input.document, rules.maxCanvasNodes) : this.defaultDocument(input.kind),
      },
      include: { project: { select: { id: true, name: true, teamId: true } } },
    })
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.canvasDocument.findFirst({
      where: { id, ...this.whereReadable(userId) },
      include: { project: { select: { id: true, name: true, teamId: true, archivedAt: true } } },
    })
    if (!row) throw new NotFoundException('画布不存在')
    return { ...row, accessRole: await this.role(userId, row) }
  }

  async update(userId: string, id: string, input: UpdateCanvasInput) {
    const rules = await this.planRules(userId)
    if (!rules.canvasAccess) throw new ForbiddenException('当前套餐未开放无限画布')
    const current = await this.get(userId, id)
    await this.assertWritable(userId, current)
    if (input.document === undefined && input.title === undefined && input.archived === undefined) throw new BadRequestException('没有需要保存的内容')
    const result = await this.prisma.canvasDocument.updateMany({
      where: { id, revision: input.expectedRevision },
      data: {
        title: input.title?.trim(),
        document: input.document === undefined ? undefined : this.sanitizeDocument(input.document, rules.maxCanvasNodes),
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
        revision: { increment: 1 },
      },
    })
    if (!result.count) throw new ConflictException('画布已在其他窗口更新，请刷新后重试')
    return this.get(userId, id)
  }

  async duplicate(userId: string, id: string, title?: string) {
    const rules = await this.planRules(userId)
    if (!rules.canvasAccess) throw new ForbiddenException('当前套餐未开放无限画布')
    const usedCanvases = await this.prisma.canvasDocument.count({ where: { userId } })
    if (usedCanvases >= rules.maxCanvases) throw new ForbiddenException(`当前套餐最多创建 ${rules.maxCanvases} 个画布`)
    const source = await this.get(userId, id)
    if (source.projectId) await this.access.projectAccess(userId, source.projectId, false)
    return this.prisma.canvasDocument.create({
      data: {
        userId,
        projectId: source.projectId,
        title: title?.trim() || `${source.title} 副本`,
        kind: source.kind,
        document: source.document as Prisma.InputJsonValue,
      },
    })
  }

  async remove(userId: string, id: string) {
    const row = await this.get(userId, id)
    if (row.userId !== userId) {
      if (!row.projectId) throw new ForbiddenException('你没有删除该画布的权限')
      await this.access.assertProjectManager(userId, row.projectId)
    }
    await this.prisma.canvasDocument.delete({ where: { id } })
    return { removed: true }
  }

  private async assertWritable(userId: string, row: { userId: string; projectId: string | null; archivedAt: Date | null; project: { archivedAt: Date | null } | null }) {
    if (row.archivedAt) throw new BadRequestException('已归档画布不能编辑')
    if (row.project?.archivedAt) throw new BadRequestException('归档项目中的画布不能编辑')
    if (row.userId === userId) return
    if (!row.projectId) throw new ForbiddenException('你没有编辑该画布的权限')
    await this.access.projectAccess(userId, row.projectId, false)
  }

  private async role(userId: string, row: { userId: string; projectId: string | null }) {
    if (row.userId === userId) return 'OWNER'
    if (!row.projectId) return 'MEMBER'
    return (await this.access.projectAccess(userId, row.projectId)).role
  }

  private documentCount(document: Prisma.JsonValue, key: 'nodes' | 'edges') {
    if (!document || Array.isArray(document) || typeof document !== 'object') return 0
    const value = (document as Prisma.JsonObject)[key]
    return Array.isArray(value) ? value.length : 0
  }

  private sanitizeDocument(input: Record<string, unknown>, maxNodes = MAX_NODES): Prisma.InputJsonObject {
    let serialized = ''
    try { serialized = JSON.stringify(input) } catch { throw new BadRequestException('画布文档不是有效 JSON') }
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) throw new BadRequestException('画布文档超过 2MB 限制')
    const parsed = JSON.parse(serialized) as Record<string, unknown>
    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : []
    const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : []
    if (rawNodes.length > maxNodes) throw new BadRequestException(`当前套餐单个画布最多包含 ${maxNodes} 个节点`)
    if (rawEdges.length > MAX_EDGES) throw new BadRequestException(`单个画布最多包含 ${MAX_EDGES} 条连线`)

    const ids = new Set<string>()
    const nodes = rawNodes.map((value, index) => {
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new BadRequestException(`第 ${index + 1} 个节点格式错误`)
      const node = value as Record<string, unknown>
      const id = this.cleanId(node.id, `node-${index + 1}`)
      if (ids.has(id)) throw new BadRequestException(`节点 ID 重复：${id}`)
      ids.add(id)
      const type = typeof node.type === 'string' && NODE_TYPES.has(node.type) ? node.type : 'TEXT'
      const position = this.point(node.position)
      const width = this.number((node.size as Record<string, unknown> | undefined)?.width, 280, 120, 2_000)
      const height = this.number((node.size as Record<string, unknown> | undefined)?.height, type === 'GROUP' ? 360 : 220, 80, 2_000)
      const data = node.data && !Array.isArray(node.data) && typeof node.data === 'object' ? node.data as Prisma.InputJsonObject : {}
      return { id, type, title: this.text(node.title, 120, this.nodeTitle(type)), position, size: { width, height }, data }
    })

    const edgeIds = new Set<string>()
    const edges = rawEdges.map((value, index) => {
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new BadRequestException(`第 ${index + 1} 条连线格式错误`)
      const edge = value as Record<string, unknown>
      const id = this.cleanId(edge.id, `edge-${index + 1}`)
      const source = this.cleanId(edge.source, '')
      const target = this.cleanId(edge.target, '')
      if (!source || !target || !ids.has(source) || !ids.has(target)) throw new BadRequestException(`连线 ${id} 引用了不存在的节点`)
      if (source === target) throw new BadRequestException('节点不能连接到自身')
      if (edgeIds.has(id)) throw new BadRequestException(`连线 ID 重复：${id}`)
      edgeIds.add(id)
      return { id, source, target, label: this.text(edge.label, 100, '') }
    })

    const viewport = parsed.viewport && !Array.isArray(parsed.viewport) && typeof parsed.viewport === 'object' ? parsed.viewport as Record<string, unknown> : {}
    return {
      version: 1,
      viewport: {
        x: this.number(viewport.x, 0, -1_000_000, 1_000_000),
        y: this.number(viewport.y, 0, -1_000_000, 1_000_000),
        zoom: this.number(viewport.zoom, 1, 0.05, 4),
      },
      background: ['dots', 'lines', 'none'].includes(String(parsed.background)) ? String(parsed.background) : 'dots',
      nodes,
      edges,
    }
  }

  private point(value: unknown) {
    const point = value && !Array.isArray(value) && typeof value === 'object' ? value as Record<string, unknown> : {}
    return { x: this.number(point.x, 0, -1_000_000, 1_000_000), y: this.number(point.y, 0, -1_000_000, 1_000_000) }
  }

  private number(value: unknown, fallback: number, min: number, max: number) {
    const next = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return Math.min(max, Math.max(min, next))
  }

  private cleanId(value: unknown, fallback: string) {
    const text = typeof value === 'string' ? value.trim() : fallback
    return /^[A-Za-z0-9_-]{1,100}$/.test(text) ? text : fallback
  }

  private text(value: unknown, max: number, fallback: string) {
    return typeof value === 'string' ? value.trim().slice(0, max) || fallback : fallback
  }

  private nodeTitle(type: string) {
    return ({ TEXT: '文本', IMAGE: '图片', VIDEO: '视频', AUDIO: '音频', GROUP: '分组', CONFIG: '生成设置' } as Record<string, string>)[type] || '节点'
  }

  private async planRules(userId: string): Promise<CanvasPlanRules> {
    const [account, subscription, freePlan] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
      this.prisma.userSubscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'TRIALING'] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
      this.prisma.subscriptionPlan.findFirst({ where: { enabled: true, priceCents: 0 }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ])
    if (account?.role === UserRole.ADMIN || account?.role === UserRole.SUPER_ADMIN) return { canvasAccess: true, shortDramaAccess: true, maxCanvases: 10_000, maxCanvasNodes: MAX_NODES }
    const plan = subscription?.plan || freePlan
    const capabilities = plan?.capabilities && typeof plan.capabilities === 'object' && !Array.isArray(plan.capabilities) ? plan.capabilities as Prisma.JsonObject : {}
    const integer = (value: Prisma.JsonValue | undefined, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback
    return {
      canvasAccess: capabilities.canvasAccess !== false,
      shortDramaAccess: capabilities.shortDramaAccess !== false,
      maxCanvases: integer(capabilities.maxCanvases, 100, 1, 10_000),
      maxCanvasNodes: integer(capabilities.maxCanvasNodes, MAX_NODES, 10, MAX_NODES),
    }
  }
}
