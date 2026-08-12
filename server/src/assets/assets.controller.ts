import { BadRequestException, Controller, Delete, Get, Param, Post, Query, Req, StreamableFile, UseGuards } from '@nestjs/common'
import { AssetKind } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { assetDisposition, AssetsService, resolveRasterImageMime } from './assets.service'

const kinds = new Set(Object.values(AssetKind))

@Controller('assets')
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService, private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('kind') kind?: AssetKind, @Query('q') query?: string) {
    if (kind && !kinds.has(kind)) throw new BadRequestException('文件类型无效')
    const rows = await this.prisma.asset.findMany({ where: { userId: user.id, deletedAt: null, kind, name: query ? { contains: query, mode: 'insensitive' } : undefined }, orderBy: { createdAt: 'desc' }, take: 100 })
    return rows.map((asset) => ({ ...asset, size: Number(asset.size), contentUrl: `/v1/assets/${asset.id}/content` }))
  }

  @Post('uploads')
  async upload(@CurrentUser() user: AuthenticatedUser, @Req() request: FastifyRequest, @Query('kind') kind: AssetKind = AssetKind.FILE, @Query('projectId') projectId?: string, @Query('purpose') purpose = 'library') {
    if (!kinds.has(kind)) throw new BadRequestException('文件类型无效')
    if (!['library', 'reference', 'mask', 'attachment'].includes(purpose)) throw new BadRequestException('文件用途无效')
    const part = await request.file()
    if (!part) throw new BadRequestException('请选择文件')
    const imageMimeType = kind === AssetKind.IMAGE ? resolveRasterImageMime(part.filename, part.mimetype) : null
    if (kind === AssetKind.IMAGE && !imageMimeType) {
      part.file.resume()
      throw new BadRequestException('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片')
    }
    const asset = await this.assets.storeUpload(user.id, { stream: part.file, name: part.filename, mimeType: imageMimeType || part.mimetype || 'application/octet-stream', kind, projectId, metadata: { purpose } })
    return { ...asset, size: Number(asset.size), contentUrl: `/v1/assets/${asset.id}/content` }
  }

  @Get(':id/content')
  async content(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.assets.readForUser(user.id, id)
    return new StreamableFile(result.file, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name) })
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.assets.remove(user.id, id) }
}
