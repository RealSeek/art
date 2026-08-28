import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { AdminGuard } from "../admin/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
import { AuthenticatedUser, CurrentUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";
import {
  AdminCreateProjectDto,
  AdminUpdateProjectDto,
  ProjectSnapshotSource,
  WORKFLOW_STATUSES,
  WorkflowConfigDto,
} from "./project-contracts";

@Controller("admin/projects")
@UseGuards(AuthGuard, AdminGuard)
export class AdminProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async create(
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body() body: AdminCreateProjectDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== "USER")
      throw new NotFoundException("所属用户不存在");
    await this.assertAssistant(body.defaultAssistantId);
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          userId: body.userId,
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
          projectId: created.id,
          version: 1,
          label: "初始版本",
          changeSummary: "管理员创建项目",
          snapshot: this.snapshot(created),
        },
      });
      return created;
    });
    await this.audit(
      admin.id,
      request,
      "project.create",
      project.id,
      undefined,
      project,
    );
    return project;
  }

  @Patch(":id")
  async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param("id") id: string,
    @Body() body: AdminUpdateProjectDto,
  ) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("项目不存在");
    await this.assertAssistant(body.defaultAssistantId);
    const { archived, changeSummary, versionLabel, workflowConfig, ...fields } =
      body;
    const project = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
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
          version: updated.revision,
          label: versionLabel?.trim() || `版本 ${updated.revision}`,
          changeSummary:
            changeSummary?.trim() || this.changeSummary(current, updated),
          snapshot: this.snapshot(updated),
        },
      });
      return updated;
    });
    await this.audit(admin.id, request, "project.update", id, current, project);
    return project;
  }

  @Delete(":id")
  async remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param("id") id: string,
  ) {
    const current = await this.prisma.project.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("项目不存在");

    // ProjectVersion cascades with the project; conversations, assets, and jobs
    // keep their user-owned records and simply lose the project association.
    await this.prisma.project.delete({ where: { id } });
    await this.audit(admin.id, request, "project.delete", id, current);
    return { id, deleted: true };
  }

  @Get()
  list(
    @Query("q") query?: string,
    @Query("status") status?: string,
    @Query("archived") archived?: string,
  ) {
    const workflowStatus = WORKFLOW_STATUSES.includes(
      status as (typeof WORKFLOW_STATUSES)[number],
    )
      ? status
      : undefined;
    return this.prisma.project.findMany({
      where: {
        workflowStatus,
        archivedAt:
          archived === "true"
            ? { not: null }
            : archived === "false"
              ? null
              : undefined,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                {
                  user: {
                    is: {
                      OR: [
                        {
                          displayName: {
                            contains: query,
                            mode: "insensitive" as const,
                          },
                        },
                        {
                          email: {
                            contains: query,
                            mode: "insensitive" as const,
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: {
        user: {
          select: { id: true, displayName: true, email: true, status: true },
        },
        defaultAssistant: { select: { id: true, name: true } },
        _count: {
          select: {
            assets: true,
            conversations: true,
            jobs: true,
            versions: true,
          },
        },
      },
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
        defaultAssistant: {
          select: { id: true, name: true, description: true },
        },
        versions: { orderBy: { version: "desc" }, take: 100 },
        _count: {
          select: {
            assets: true,
            conversations: true,
            jobs: true,
            versions: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException("项目不存在");
    return project;
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

  private audit(
    actorId: string,
    request: FastifyRequest,
    action: string,
    targetId: string,
    before?: unknown,
    after?: unknown,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType: "project",
        targetId,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
        ...(before == null ? {} : { before: before as Prisma.InputJsonValue }),
        ...(after == null ? {} : { after: after as Prisma.InputJsonValue }),
      },
    });
  }
}
