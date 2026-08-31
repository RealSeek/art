import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser, AuthenticatedUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceAccessService } from "../common/resource-access.service";
import { publicAssetSelect, toPublicAsset } from "../assets/public-asset.dto";

import {
  AssignProjectTeamDto,
  CreateVersionDto,
  ProjectDto,
  ProjectMemberDto,
  ProjectMemberRoleDto,
  ProjectSnapshotSource,
  UpdateProjectDto,
  WORKFLOW_STATUSES,
  WorkflowConfigDto,
  WorkflowDto,
} from "./project-contracts";

@Controller("projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly prisma: PrismaService, private readonly access: ResourceAccessService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("archived") archived?: string,
    @Query("q") query?: string,
  ) {
    const projects = await this.prisma.project.findMany({
      where: {
        ...this.access.projectWhere(user.id),
        archivedAt: archived === "true" ? { not: null } : null,
        name: query ? { contains: query, mode: "insensitive" } : undefined,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        members: { where: { userId: user.id }, select: { role: true } },
        team: { select: { id: true, name: true, ownerId: true, members: { where: { userId: user.id }, select: { role: true } } } },
        conversations: { where: { userId: user.id, archivedAt: null }, select: { id: true } },
        assets: { where: { userId: user.id, deletedAt: null }, select: { id: true } },
        _count: {
          select: { assets: true, conversations: true, versions: true },
        },
      },
    });
    return projects.map(({ conversations, assets, members, ...project }) => {
      const teamRole = project.team?.ownerId === user.id ? "OWNER" : project.team?.members[0]?.role;
      const accessRole = project.userId === user.id ? "OWNER" : members[0]?.role === "ADMIN" || teamRole === "OWNER" || teamRole === "ADMIN" ? "ADMIN" : "MEMBER";
      const sharedThroughTeam = Boolean(project.teamId && teamRole);
      return {
        ...project,
        team: project.team ? { id: project.team.id, name: project.team.name } : null,
        accessRole,
        _count: accessRole === "OWNER" || sharedThroughTeam ? project._count : { ...project._count, conversations: conversations.length, assets: assets.length },
      };
    });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ProjectDto,
  ) {
    await this.assertAssistant(body.defaultAssistantId);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          userId: user.id,
          name: body.name.trim(),
          description: body.description?.trim() || "",
          instructions: body.instructions?.trim() || "",
          workflowStatus: body.workflowStatus || "PLANNING",
          workflowConfig: this.workflowConfig(body.workflowConfig),
          defaultModel: body.defaultModel?.trim() || "",
          defaultAssistantId: body.defaultAssistantId || null,
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: project.id,
          version: 1,
          label: "初始版本",
          changeSummary: "创建项目",
          snapshot: this.snapshot(project),
        },
      });
      return project;
    });
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...this.access.projectWhere(user.id) },
      include: {
        assets: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { ...publicAssetSelect, userId: true },
        },
        conversations: {
          where: { archivedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 30,
          include: { user: { select: { id: true, displayName: true, email: true } } },
        },
        user: { select: { id: true, displayName: true, email: true } },
        members: { include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } }, orderBy: { joinedAt: "asc" } },
        team: { select: { id: true, name: true, ownerId: true, members: { where: { userId: user.id }, select: { role: true } } } },
        activeSkillVersion: true,
        defaultAssistant: {
          select: {
            id: true,
            name: true,
            description: true,
            defaultModel: true,
          },
        },
        _count: { select: { assets: { where: { deletedAt: null } }, conversations: { where: { archivedAt: null } }, versions: true } },
      },
    });
    if (!project) throw new NotFoundException("项目不存在");
    const member = project.members.find((item) => item.userId === user.id);
    const teamRole = project.team?.ownerId === user.id ? "OWNER" : project.team?.members[0]?.role;
    const accessRole = project.userId === user.id ? "OWNER" : member?.role === "ADMIN" || teamRole === "OWNER" || teamRole === "ADMIN" ? "ADMIN" : "MEMBER";
    const sharedThroughTeam = Boolean(project.teamId && teamRole);
    const visibleConversations = accessRole === "OWNER" || sharedThroughTeam ? project.conversations : project.conversations.filter((conversation) => conversation.userId === user.id);
    const visibleAssets = accessRole === "OWNER" || sharedThroughTeam ? project.assets : project.assets.filter((asset) => asset.userId === user.id);
    return {
      ...project,
      team: project.team ? { id: project.team.id, name: project.team.name } : null,
      accessRole,
      conversations: visibleConversations,
      assets: visibleAssets.map((asset) => toPublicAsset(asset)),
      _count: { ...project._count, assets: visibleAssets.length, conversations: visibleConversations.length },
    };
  }

  @Patch(":id/team")
  async assignTeam(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: AssignProjectTeamDto) {
    const project = await this.access.assertProjectManager(user.id, id);
    const teamId = body.teamId || null;
    if (teamId) await this.access.assertTeamManager(teamId, user.id);
    const previousTeamId = project.teamId;
    if (previousTeamId === teamId) return { assigned: true, teamId };
    await this.prisma.$transaction([
      this.prisma.project.update({ where: { id }, data: { teamId } }),
      this.prisma.asset.updateMany({ where: { projectId: id }, data: { teamId } }),
    ]);
    if (previousTeamId) await this.access.auditTeamResource(previousTeamId, user.id, "project.unassigned", "project", id, { nextTeamId: teamId });
    if (teamId) await this.access.auditTeamResource(teamId, user.id, "project.assigned", "project", id, { previousTeamId });
    return { assigned: true, teamId };
  }

  @Post(":id/members")
  async addMember(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: ProjectMemberDto) {
    const project = await this.findOwnedProject(user.id, id);
    const member = await this.prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: { id: true, email: true, displayName: true, avatarUrl: true } });
    if (!member) throw new NotFoundException("该邮箱尚未注册");
    if (member.id === project.userId) throw new BadRequestException("项目所有者无需重复加入");
    return this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: member.id } },
      update: { role: body.role || "MEMBER" },
      create: { projectId: id, userId: member.id, role: body.role || "MEMBER" },
      include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
    });
  }

  @Patch(":id/members/:userId")
  async updateMemberRole(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("userId") memberUserId: string, @Body() body: ProjectMemberRoleDto) {
    await this.findOwnedProject(user.id, id);
    const result = await this.prisma.projectMember.updateMany({ where: { projectId: id, userId: memberUserId }, data: { role: body.role } });
    if (!result.count) throw new NotFoundException("项目成员不存在");
    return { updated: true };
  }

  @Delete(":id/members/:userId")
  async removeMember(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("userId") memberUserId: string) {
    await this.findOwnedProject(user.id, id);
    const result = await this.prisma.projectMember.deleteMany({ where: { projectId: id, userId: memberUserId } });
    if (!result.count) throw new NotFoundException("项目成员不存在");
    return { removed: true };
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: UpdateProjectDto,
  ) {
    const current = await this.findManageableProject(user.id, id);
    await this.assertAssistant(body.defaultAssistantId);
    const { archived, changeSummary, versionLabel, workflowConfig, ...fields } =
      body;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: {
          ...fields,
          name: fields.name?.trim(),
          description: fields.description?.trim(),
          instructions: fields.instructions?.trim(),
          defaultModel: fields.defaultModel?.trim(),
          defaultAssistantId:
            fields.defaultAssistantId === undefined
              ? undefined
              : fields.defaultAssistantId || null,
          workflowConfig:
            workflowConfig === undefined
              ? undefined
              : this.workflowConfig(workflowConfig),
          archivedAt:
            archived === undefined ? undefined : archived ? new Date() : null,
          revision: { increment: 1 },
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: id,
          version: project.revision,
          label: versionLabel?.trim() || `版本 ${project.revision}`,
          changeSummary:
            changeSummary?.trim() || this.changeSummary(current, project),
          snapshot: this.snapshot(project),
        },
      });
      return project;
    });
  }

  @Get(":id/workflow")
  async workflow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const project = await this.findAccessibleProject(user.id, id);
    return { ...project, ...this.workflowResponse(project) };
  }

  @Patch(":id/workflow")
  async updateWorkflow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: WorkflowDto,
  ) {
    const current = await this.findManageableProject(user.id, id);
    await this.assertAssistant(body.defaultAssistantId);
    const project = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: {
          workflowStatus: body.workflowStatus,
          workflowConfig: this.workflowConfig(body.workflowConfig),
          defaultModel: body.defaultModel?.trim() || "",
          defaultAssistantId: body.defaultAssistantId || null,
          instructions: body.instructions?.trim() || "",
          revision: { increment: 1 },
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: id,
          version: updated.revision,
          label: body.versionLabel?.trim() || `版本 ${updated.revision}`,
          changeSummary:
            body.changeSummary?.trim() || this.changeSummary(current, updated),
          snapshot: this.snapshot(updated),
        },
      });
      return updated;
    });
    return { ...project, ...this.workflowResponse(project) };
  }

  @Get(":id/versions")
  async versions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    await this.findAccessibleProject(user.id, id);
    return this.prisma.projectVersion.findMany({
      where: { projectId: id },
      orderBy: { version: "desc" },
      take: 100,
    });
  }

  @Post(":id/versions")
  async createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: CreateVersionDto,
  ) {
    const current = await this.findManageableProject(user.id, id);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
      return tx.projectVersion.create({
        data: {
          projectId: id,
          version: project.revision,
          label: body.label?.trim() || `版本 ${project.revision}`,
          changeSummary:
            body.changeSummary?.trim() ||
            `基于版本 ${current.revision} 创建检查点`,
          snapshot: this.snapshot(project),
        },
      });
    });
  }

  @Post(":id/versions/:version/restore")
  async restoreVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("version") versionParam: string,
  ) {
    const current = await this.findManageableProject(user.id, id);
    const version = Number.parseInt(versionParam, 10);
    const source = Number.isInteger(version)
      ? await this.prisma.projectVersion.findFirst({
          where: { projectId: id, version },
        })
      : null;
    if (!source) throw new NotFoundException("项目版本不存在");
    const snapshot = source.snapshot as unknown as ProjectSnapshotSource;
    await this.assertAssistant(snapshot.defaultAssistantId);
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: {
          name: snapshot.name,
          description: snapshot.description,
          instructions: snapshot.instructions,
          workflowStatus: WORKFLOW_STATUSES.includes(
            snapshot.workflowStatus as (typeof WORKFLOW_STATUSES)[number],
          )
            ? snapshot.workflowStatus
            : "PLANNING",
          workflowConfig: (snapshot.workflowConfig ||
            this.workflowConfig()) as Prisma.InputJsonValue,
          defaultModel: snapshot.defaultModel || "",
          defaultAssistantId: snapshot.defaultAssistantId || null,
          revision: { increment: 1 },
        },
      });
      await tx.projectVersion.create({
        data: {
          projectId: id,
          version: project.revision,
          label: `恢复自版本 ${version}`,
          changeSummary: `从版本 ${current.revision} 恢复到版本 ${version} 的内容`,
          snapshot: this.snapshot(project),
        },
      });
      return project;
    });
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const project = await this.access.assertProjectManager(user.id, id);
    await this.prisma.project.delete({ where: { id } });
    if (project.teamId) await this.access.auditTeamResource(project.teamId, user.id, "project.deleted", "project", id);
    return { deleted: true };
  }

  private async findOwnedProject(userId: string, id: string) {
    return this.access.assertProjectManager(userId, id);
  }

  private async findAccessibleProject(userId: string, id: string) {
    await this.access.projectAccess(userId, id);
    return this.prisma.project.findUniqueOrThrow({ where: { id } });
  }

  private async findManageableProject(userId: string, id: string) {
    await this.access.assertProjectManager(userId, id);
    return this.prisma.project.findUniqueOrThrow({ where: { id } });
  }

  private async assertAssistant(id?: string | null) {
    if (!id) return;
    const assistant = await this.prisma.assistant.findFirst({
      where: { id, enabled: true, visibility: "PUBLIC" },
      select: { id: true },
    });
    if (!assistant) throw new NotFoundException("默认助手不存在或未发布");
  }

  private workflowConfig(config?: WorkflowConfigDto): Prisma.InputJsonValue {
    return {
      steps: (config?.steps || []).map((step, index) => ({
        id: step.id,
        title: step.title.trim(),
        description: step.description?.trim() || "",
        status: step.status,
        sortOrder: index,
      })),
      defaultPrompt: config?.defaultPrompt?.trim() || "",
      outputRequirements: config?.outputRequirements?.trim() || "",
    };
  }

  private snapshot(project: ProjectSnapshotSource): Prisma.InputJsonValue {
    return {
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      workflowStatus: project.workflowStatus,
      workflowConfig: project.workflowConfig || this.workflowConfig(),
      defaultModel: project.defaultModel,
      defaultAssistantId: project.defaultAssistantId,
      revision: project.revision,
    } as Prisma.InputJsonObject;
  }

  private workflowResponse(project: ProjectSnapshotSource) {
    return {
      workflowStatus: project.workflowStatus,
      workflowConfig: project.workflowConfig || this.workflowConfig(),
      defaultModel: project.defaultModel,
      defaultAssistantId: project.defaultAssistantId,
      instructions: project.instructions,
      revision: project.revision,
    };
  }

  private changeSummary(
    before: ProjectSnapshotSource,
    after: ProjectSnapshotSource,
  ) {
    const changed: string[] = [];
    if (before.name !== after.name || before.description !== after.description)
      changed.push("项目信息");
    if (before.instructions !== after.instructions) changed.push("项目指令");
    if (
      before.workflowStatus !== after.workflowStatus ||
      JSON.stringify(before.workflowConfig) !==
        JSON.stringify(after.workflowConfig)
    )
      changed.push("工作流");
    if (
      before.defaultModel !== after.defaultModel ||
      before.defaultAssistantId !== after.defaultAssistantId
    )
      changed.push("默认执行配置");
    return changed.length ? `更新${changed.join("、")}` : "保存项目设置";
  }
}
