import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { randomBytes } from 'node:crypto'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { ModerationService } from '../moderation/moderation.service'
import { PrismaService } from '../prisma/prisma.service'
import { publicGenerationError } from '../generations/generation-errors'

class CreateConversationDto { @IsOptional() @IsString() @MinLength(1) @MaxLength(100) projectId?: string; @IsOptional() @IsString() @Matches(/\S/) @MaxLength(160) model?: string; @IsOptional() @IsString() @Matches(/\S/) @MaxLength(120) title?: string; @IsOptional() @IsBoolean() temporary?: boolean }
class AddMessageDto { @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(50_000) content!: string; @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @IsNotEmpty({ each: true }) assetIds?: string[] }
class BranchMessageDto { @IsOptional() @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(50_000) content?: string }
class MessageFeedbackDto { @IsOptional() @IsIn(['UP', 'DOWN']) value?: 'UP' | 'DOWN' | null }
class UpdateConversationDto {
  @IsOptional() @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(120) title?: string
  @IsOptional() @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(80) model?: string
  @IsOptional() @IsBoolean() pinned?: boolean
}

@Controller('conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly prisma: PrismaService, private readonly moderation: ModerationService) {}
  @Get() async list(@CurrentUser() user: AuthenticatedUser) {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId: user.id }, select: { dataRetentionDays: true } })
    await this.prisma.conversation.deleteMany({ where: { userId: user.id, temporary: true, expiresAt: { lt: new Date() } } })
    if (settings?.dataRetentionDays) await this.prisma.conversation.deleteMany({ where: { userId: user.id, temporary: false, updatedAt: { lt: new Date(Date.now() - settings.dataRetentionDays * 86_400_000) } } })
    return this.prisma.conversation.findMany({ where: { userId: user.id, archivedAt: null, temporary: false }, orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 100, select: { id: true, title: true, model: true, projectId: true, temporary: true, pinnedAt: true, sharedAt: true, createdAt: true, updatedAt: true } })
  }
  @Get('export') async exportData(@CurrentUser() user: AuthenticatedUser) {
    const [account, conversations, projects, assets] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, displayName: true, createdAt: true, settings: true } }),
      this.prisma.conversation.findMany({ where: { userId: user.id, temporary: false }, orderBy: { createdAt: 'asc' }, include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, model: true, metadata: true, createdAt: true } } } }),
      this.prisma.project.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, description: true, instructions: true, archivedAt: true, createdAt: true, updatedAt: true } }),
      this.prisma.asset.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, projectId: true, kind: true, name: true, mimeType: true, size: true, width: true, height: true, metadata: true, createdAt: true } }),
    ])
    return { exportedAt: new Date().toISOString(), account, conversations, projects, assets: assets.map((asset) => ({ ...asset, size: Number(asset.size) })) }
  }
  @Delete() async clear(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.prisma.conversation.deleteMany({ where: { userId: user.id } })
    return { deleted: result.count }
  }
  @Post() async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateConversationDto) {
    if (body.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: body.projectId, userId: user.id }, select: { id: true } })
      if (!project) throw new NotFoundException('项目不存在')
    }
    const [settings, userSettings] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { id: 'global' } }),
      this.prisma.userSettings.findUnique({ where: { userId: user.id } }),
    ])
    const temporary = body.temporary ?? userSettings?.temporaryChatDefault ?? (userSettings ? !userSettings.chatHistoryEnabled : false)
    const retentionHours = Math.max(1, settings?.temporaryChatRetentionHours || 24)
    return this.prisma.conversation.create({ data: { userId: user.id, projectId: body.projectId, title: body.title?.trim() || '新对话', model: body.model?.trim() || process.env.AI_CHAT_MODEL || 'gpt-4.1', temporary, expiresAt: temporary ? new Date(Date.now() + retentionHours * 3_600_000) : null } })
  }
  @Get(':id') async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id }, include: { messages: { orderBy: { createdAt: 'asc' }, include: { attachments: { include: { asset: true } } } }, jobs: { where: { kind: { in: ['IMAGE', 'VIDEO', 'COMMERCE'] } }, orderBy: { createdAt: 'desc' }, take: 100, include: { outputs: { orderBy: { position: 'asc' }, include: { asset: true } } } } } })
    if (!conversation) throw new NotFoundException('对话不存在')
    const { jobs, ...detail } = conversation
    return {
      ...detail,
      messages: conversation.messages.map((message) => ({
        ...message,
        attachments: message.attachments.map((attachment) => ({
          ...attachment,
          asset: { ...attachment.asset, size: Number(attachment.asset.size), contentUrl: `/v1/assets/${attachment.asset.id}/content` },
        })),
      })),
      generationJobs: jobs.map((job) => ({
        ...job,
        errorMessage: publicGenerationError(job.kind, job.status, job.errorMessage),
        outputs: job.outputs.map((output) => ({ ...output, asset: { ...output.asset, size: Number(output.asset.size), contentUrl: `/v1/assets/${output.asset.id}/content` } })),
      })),
    }
  }
  @Post(':id/messages') async message(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: AddMessageDto) {
    await this.moderation.inspect(user.id, 'CHAT', body.content, { conversationId: id, entry: 'message' })
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id } })
    if (!conversation) throw new NotFoundException('对话不存在')
    if (body.assetIds?.length) {
      const count = await this.prisma.asset.count({ where: { id: { in: body.assetIds }, userId: user.id, deletedAt: null } })
      if (count !== body.assetIds.length) throw new NotFoundException('附件不存在')
    }
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({ data: { conversationId: id, role: 'USER', content: body.content, attachments: body.assetIds?.length ? { create: body.assetIds.map((assetId) => ({ assetId })) } : undefined }, include: { attachments: true } })
      await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } })
      return message
    })
  }
  @Post(':id/messages/:messageId/branch')
  async branchMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('messageId') messageId: string, @Body() body: BranchMessageDto) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id }, select: { id: true } })
    if (!conversation) throw new NotFoundException('对话不存在')
    const messages = await this.prisma.message.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, role: true, content: true } })
    const messageIndex = messages.findIndex((message) => message.id === messageId)
    const target = messages[messageIndex]
    if (!target || target.role !== 'USER') throw new NotFoundException('用户消息不存在')
    const content = body.content?.trim() || target.content
    await this.moderation.inspect(user.id, 'CHAT', content, { conversationId: id, messageId, entry: 'branch' })
    const followingIds = messages.slice(messageIndex + 1).map((message) => message.id)
    return this.prisma.$transaction(async (tx) => {
      if (followingIds.length) await tx.message.deleteMany({ where: { id: { in: followingIds }, conversationId: id } })
      const updated = await tx.message.update({ where: { id: messageId }, data: { content } })
      await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } })
      return updated
    })
  }
  @Patch(':id/messages/:messageId/feedback')
  async feedback(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('messageId') messageId: string, @Body() body: MessageFeedbackDto) {
    const message = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: id, role: 'ASSISTANT', conversation: { userId: user.id } }, select: { id: true, metadata: true } })
    if (!message) throw new NotFoundException('助手消息不存在')
    const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata) ? message.metadata as Record<string, unknown> : {}
    await this.prisma.message.update({ where: { id: message.id }, data: { metadata: { ...metadata, feedback: body.value || null } } })
    return { id: message.id, feedback: body.value || null }
  }
  @Patch(':id') async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateConversationDto) {
    const result = await this.prisma.conversation.updateMany({ where: { id, userId: user.id }, data: { title: body.title?.trim(), model: body.model, pinnedAt: body.pinned === undefined ? undefined : body.pinned ? new Date() : null } })
    if (!result.count) throw new NotFoundException('对话不存在')
    return { updated: true }
  }
  @Post(':id/share') async share(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId: user.id, temporary: false }, select: { id: true, shareToken: true } })
    if (!conversation) throw new NotFoundException('对话不存在或临时聊天不可分享')
    const shareToken = conversation.shareToken || randomBytes(24).toString('base64url')
    const sharedAt = new Date()
    await this.prisma.conversation.update({ where: { id }, data: { shareToken, sharedAt } })
    return { token: shareToken, sharedAt }
  }
  @Delete(':id/share') async revokeShare(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.prisma.conversation.updateMany({ where: { id, userId: user.id }, data: { shareToken: null, sharedAt: null } })
    if (!result.count) throw new NotFoundException('对话不存在')
    return { revoked: true }
  }
  @Delete(':id') async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { const result = await this.prisma.conversation.updateMany({ where: { id, userId: user.id }, data: { archivedAt: new Date() } }); if (!result.count) throw new NotFoundException('对话不存在'); return { archived: true } }
  @Delete(':id/permanent') async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.prisma.conversation.deleteMany({ where: { id, userId: user.id } })
    if (!result.count) throw new NotFoundException('对话不存在')
    return { deleted: true }
  }
}

@Controller('shares')
export class ConversationSharesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':token') async get(@Param('token') token: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { shareToken: token, sharedAt: { not: null }, archivedAt: null, temporary: false },
      select: {
        title: true,
        model: true,
        createdAt: true,
        sharedAt: true,
        messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, role: true, content: true, model: true, createdAt: true } },
      },
    })
    if (!conversation) throw new NotFoundException('共享对话不存在或已停止共享')
    return conversation
  }
}
