import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type ResourceRole = 'OWNER' | 'ADMIN' | 'MEMBER'

@Injectable()
export class ResourceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  projectWhere(userId: string): Prisma.ProjectWhereInput {
    return {
      OR: [
        { userId },
        { members: { some: { userId } } },
        { team: { is: { status: 'ACTIVE', members: { some: { userId } } } } },
      ],
    }
  }

  assetWhere(userId: string): Prisma.AssetWhereInput {
    return {
      OR: [
        { userId },
        { team: { is: { status: 'ACTIVE', members: { some: { userId } } } } },
        { project: { is: this.projectWhere(userId) } },
      ],
    }
  }

  knowledgeBaseWhere(userId: string): Prisma.KnowledgeBaseWhereInput {
    return {
      OR: [
        { creatorId: userId },
        { team: { is: { status: 'ACTIVE', members: { some: { userId } } } } },
      ],
    }
  }

  async teamRole(teamId: string, userId: string): Promise<ResourceRole | null> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, status: 'ACTIVE' },
      select: { ownerId: true, members: { where: { userId }, select: { role: true } } },
    })
    if (!team) return null
    if (team.ownerId === userId) return 'OWNER'
    const role = team.members[0]?.role
    return role === 'ADMIN' ? 'ADMIN' : role === 'MEMBER' ? 'MEMBER' : null
  }

  async assertTeamMember(teamId: string, userId: string) {
    const role = await this.teamRole(teamId, userId)
    if (!role) throw new NotFoundException('团队不存在或你不是团队成员')
    return role
  }

  async assertTeamManager(teamId: string, userId: string) {
    const role = await this.assertTeamMember(teamId, userId)
    if (role === 'MEMBER') throw new ForbiddenException('只有团队所有者或管理员可以管理共享资源')
    return role
  }

  async projectAccess(userId: string, projectId: string, allowArchived = true) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...(allowArchived ? {} : { archivedAt: null }), ...this.projectWhere(userId) },
      select: {
        id: true,
        userId: true,
        teamId: true,
        archivedAt: true,
        members: { where: { userId }, select: { role: true } },
        team: { select: { name: true, status: true, ownerId: true, members: { where: { userId }, select: { role: true } } } },
      },
    })
    if (!project) throw new NotFoundException('项目不存在')
    const directRole = project.members[0]?.role
    const teamRole = project.team?.ownerId === userId ? 'OWNER' : project.team?.members[0]?.role
    const role: ResourceRole = project.userId === userId
      ? 'OWNER'
      : directRole === 'ADMIN' || teamRole === 'ADMIN' || teamRole === 'OWNER'
        ? 'ADMIN'
        : 'MEMBER'
    return { ...project, role, viaTeam: Boolean(project.teamId && teamRole) }
  }

  async assertProjectManager(userId: string, projectId: string) {
    const access = await this.projectAccess(userId, projectId)
    if (access.role === 'MEMBER') throw new ForbiddenException('你没有项目管理权限')
    return access
  }

  async assertAssetReadable(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null, ...this.assetWhere(userId) },
    })
    if (!asset) throw new NotFoundException('文件不存在')
    return asset
  }

  async assertAssetManager(userId: string, assetId: string) {
    const asset = await this.assertAssetReadable(userId, assetId)
    if (asset.userId === userId) return asset
    if (asset.teamId) {
      await this.assertTeamManager(asset.teamId, userId)
      return asset
    }
    if (asset.projectId) {
      await this.assertProjectManager(userId, asset.projectId)
      return asset
    }
    throw new ForbiddenException('你没有文件管理权限')
  }

  async assertKnowledgeBaseReadable(userId: string, knowledgeBaseId: string) {
    const row = await this.prisma.knowledgeBase.findFirst({
      where: { id: knowledgeBaseId, ...this.knowledgeBaseWhere(userId) },
    })
    if (!row) throw new NotFoundException('知识库不存在')
    return row
  }

  async assertKnowledgeBaseManager(userId: string, knowledgeBaseId: string) {
    const row = await this.assertKnowledgeBaseReadable(userId, knowledgeBaseId)
    if (row.creatorId === userId) return row
    if (row.teamId) {
      await this.assertTeamManager(row.teamId, userId)
      return row
    }
    throw new ForbiddenException('你没有知识库管理权限')
  }

  auditTeamResource(teamId: string, actorId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
    return this.prisma.teamAuditLog.create({
      data: { teamId, actorId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue | undefined },
    })
  }
}
