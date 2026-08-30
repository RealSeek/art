import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { JobKind, Prisma, ProjectSkillChangeType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ResourceAccessService } from '../common/resource-access.service'
import { GenerationsService } from '../generations/generations.service'

type ActivateSkillInput = {
  name: string
  content: string
  changeSummary?: string
  sourceConversationId?: string
  changeType?: ProjectSkillChangeType
}

@Injectable()
export class ProjectSkillsService {
  constructor(private readonly prisma: PrismaService, private readonly generations: GenerationsService, private readonly access: ResourceAccessService) {}

  async status(userId: string, projectId: string) {
    const project = await this.accessibleProject(userId, projectId)
    const versions = await this.prisma.projectSkillVersion.findMany({
      where: { projectId },
      orderBy: { version: 'desc' },
      take: 100,
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        sourceConversation: { select: { id: true, title: true } },
      },
    })
    return {
      canManage: this.canManage(project, userId),
      activeVersionId: project.activeSkillVersionId,
      active: versions.find((item) => item.id === project.activeSkillVersionId) || null,
      versions: versions.map((item) => ({ ...item, active: item.id === project.activeSkillVersionId })),
    }
  }

  async activate(userId: string, projectId: string, input: ActivateSkillInput) {
    const project = await this.manageableProject(userId, projectId)
    const name = input.name.trim()
    const content = input.content.trim()
    if (!name || !content) throw new BadRequestException('技能名称和内容不能为空')
    if (input.sourceConversationId) await this.ownProjectConversation(userId, projectId, input.sourceConversationId)
    return this.createVersion(project, userId, {
      name,
      content,
      enabled: true,
      changeType: input.changeType || ProjectSkillChangeType.MANUAL,
      changeSummary: input.changeSummary?.trim() || (input.changeType === ProjectSkillChangeType.SUMMARY ? '根据项目对话总结并替换技能' : '手动设置项目技能'),
      sourceConversationId: input.sourceConversationId,
    })
  }

  async disable(userId: string, projectId: string) {
    const project = await this.manageableProject(userId, projectId)
    if (!project.activeSkillVersion) throw new BadRequestException('项目当前未启用技能')
    return this.createVersion(project, userId, {
      name: project.activeSkillVersion.name,
      content: project.activeSkillVersion.content,
      enabled: false,
      changeType: ProjectSkillChangeType.DISABLE,
      changeSummary: '停用项目技能',
    })
  }

  async restore(userId: string, projectId: string, version: number) {
    const project = await this.manageableProject(userId, projectId)
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('技能版本号无效')
    const source = await this.prisma.projectSkillVersion.findFirst({ where: { projectId, version } })
    if (!source) throw new NotFoundException('技能版本不存在')
    return this.createVersion(project, userId, {
      name: source.name,
      content: source.content,
      enabled: source.enabled,
      changeType: ProjectSkillChangeType.RESTORE,
      changeSummary: `恢复技能 v${source.version}`,
      sourceConversationId: source.sourceConversationId || undefined,
    })
  }

  async summarize(userId: string, projectId: string, conversationId: string, request = '') {
    const project = await this.accessibleProject(userId, projectId)
    const conversation = await this.ownProjectConversation(userId, projectId, conversationId)
    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 80,
      select: { role: true, content: true },
    })
    if (!messages.length) throw new BadRequestException('该对话还没有可用于总结的内容')
    const transcript = messages.map((item) => `${item.role === 'USER' ? '用户' : '助手'}：${item.content}`).join('\n\n').slice(-40_000)
    const oldSkill = project.activeSkillVersion?.enabled ? project.activeSkillVersion : null
    const prompt = `你是企业项目技能维护助手。请从旧技能和项目对话中提炼可复用、明确、可执行的新技能。保留有效规则，吸收已经验证的偏好、流程和质量标准；禁止写入一次性任务、个人隐私、账号密钥或对话原文。\n\n旧技能名称：${oldSkill?.name || '未设置'}\n旧技能内容：\n${oldSkill?.content || '无'}\n\n调整要求：\n${request.trim() || '结合对话自动提炼'}\n\n来源对话《${conversation.title}》：\n${transcript}\n\n只返回 JSON：{"name":"简短技能名称","content":"完整技能正文","changeSummary":"本次变化摘要"}`
    const candidate = await this.generateCandidate(userId, projectId, project.defaultModel || undefined, prompt)
    return { ...candidate, sourceConversation: { id: conversation.id, title: conversation.title }, basedOnVersion: oldSkill?.version || null }
  }

  private async createVersion(
    project: Awaited<ReturnType<ProjectSkillsService['accessibleProject']>>,
    userId: string,
    input: { name: string; content: string; enabled: boolean; changeType: ProjectSkillChangeType; changeSummary: string; sourceConversationId?: string },
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const current = await tx.project.findUniqueOrThrow({ where: { id: project.id }, select: { activeSkillVersionId: true } })
          const updated = await tx.project.update({ where: { id: project.id }, data: { skillRevision: { increment: 1 } }, select: { skillRevision: true } })
          const version = await tx.projectSkillVersion.create({
            data: {
              projectId: project.id,
              version: updated.skillRevision,
              name: input.name,
              content: input.content,
              enabled: input.enabled,
              changeType: input.changeType,
              changeSummary: input.changeSummary,
              previousVersionId: current.activeSkillVersionId || undefined,
              sourceConversationId: input.sourceConversationId,
              createdById: userId,
            },
            include: { createdBy: { select: { id: true, displayName: true, email: true } }, sourceConversation: { select: { id: true, title: true } } },
          })
          await tx.project.update({ where: { id: project.id }, data: { activeSkillVersionId: version.id } })
          return { ...version, active: true }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error
      }
    }
    throw new Error('项目技能版本创建失败')
  }

  private accessibleProject(userId: string, projectId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, ...this.access.projectWhere(userId) },
      select: {
        id: true,
        userId: true,
        defaultModel: true,
        activeSkillVersionId: true,
        activeSkillVersion: true,
        members: { where: { userId }, select: { role: true } },
        team: { select: { ownerId: true, members: { where: { userId }, select: { role: true } } } },
      },
    }).then((project) => {
      if (!project) throw new NotFoundException('项目不存在')
      return project
    })
  }

  private canManage(project: Awaited<ReturnType<ProjectSkillsService['accessibleProject']>>, userId: string) {
    return project.userId === userId || project.members.some((member) => member.role === 'ADMIN') || project.team?.ownerId === userId || project.team?.members.some((member) => member.role === 'ADMIN')
  }

  private manageableProject(userId: string, projectId: string) {
    return this.accessibleProject(userId, projectId).then((project) => {
      if (!this.canManage(project, userId)) throw new ForbiddenException('只有项目所有者或管理员可以修改项目技能')
      return project
    })
  }

  private ownProjectConversation(userId: string, projectId: string, conversationId: string) {
    return this.prisma.conversation.findFirst({ where: { id: conversationId, projectId, userId }, select: { id: true, title: true } }).then((conversation) => {
      if (!conversation) throw new ForbiddenException('只能使用自己在该项目中的对话')
      return conversation
    })
  }

  private async generateCandidate(userId: string, projectId: string, model: string | undefined, prompt: string) {
    const conversation = await this.prisma.conversation.create({
      data: {
        userId,
        projectId,
        title: 'Project skill summary',
        model: model || '',
        temporary: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        messages: { create: { authorId: userId, role: 'USER', content: prompt, metadata: { internal: true, purpose: 'project-skill-summary' } } },
      },
    })
    let job: Awaited<ReturnType<GenerationsService['create']>>
    try {
      job = await this.generations.create(userId, {
        kind: JobKind.CHAT,
        prompt,
        model,
        projectId,
        conversationId: conversation.id,
        options: { disableAssistantTools: true, maxOutputTokens: 4096, internalPurpose: 'project-skill-summary' },
        idempotencyKey: `project-skill-summary:${conversation.id}`,
      })
    } catch (error) {
      await this.prisma.conversation.delete({ where: { id: conversation.id } }).catch(() => undefined)
      throw error
    }
    const deadline = Date.now() + 5 * 60_000
    while (Date.now() < deadline) {
      const current = await this.generations.get(userId, job.id)
      if (current.status === 'SUCCEEDED') {
        const content = current.stream?.content || ''
        if (!content.trim()) throw new BadGatewayException('技能总结模型未返回内容')
        try { return this.parseCandidate(content) }
        catch (error) { throw new BadGatewayException(error instanceof Error ? error.message : '技能总结失败') }
      }
      if (current.status === 'FAILED') throw new BadGatewayException(current.errorMessage || '技能总结失败')
      if (current.status === 'CANCELLED') throw new BadGatewayException('技能总结已取消')
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    await this.generations.cancel(userId, job.id).catch(() => undefined)
    throw new BadGatewayException('技能总结超时')
  }

  private parseCandidate(raw: string) {
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let value: Record<string, unknown>
    try { value = JSON.parse(normalized) as Record<string, unknown> } catch { throw new Error('模型未返回有效的技能内容') }
    const name = String(value.name || '').trim().slice(0, 80)
    const content = String(value.content || '').trim().slice(0, 50_000)
    const changeSummary = String(value.changeSummary || '根据项目对话更新技能').trim().slice(0, 500)
    if (!name || !content) throw new Error('模型返回的技能名称或内容为空')
    return { name, content, changeSummary }
  }
}
