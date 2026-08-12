import { Controller, Get, NotFoundException, Param, Query, StreamableFile } from '@nestjs/common'
import { InspirationMode } from '@prisma/client'
import { assetDisposition, AssetsService } from '../assets/assets.service'
import { PrismaService } from '../prisma/prisma.service'

@Controller('inspirations')
export class InspirationsController {
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService) {}

  @Get()
  async list(@Query('mode') mode: InspirationMode = InspirationMode.IMAGE) {
    const rows = await this.prisma.inspiration.findMany({ where: { mode, enabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    return rows.map((item) => {
      const options = this.record(item.options)
      const externalImages = Array.isArray(options.previewImages) ? options.previewImages.filter((value): value is string => typeof value === 'string') : []
      const uploadedImages = this.previewAssetIds(options).map((assetId) => `/v1/inspirations/${item.id}/previews/${assetId}`)
      const videoAssetId = this.previewVideoAssetId(options)
      return { ...item, imageUrl: item.coverAssetId ? `/v1/inspirations/${item.id}/cover` : item.coverUrl, videoUrl: videoAssetId ? `/v1/inspirations/${item.id}/video` : this.previewVideoUrl(options), options: { ...options, previewImages: [...uploadedImages, ...externalImages] } }
    })
  }

  @Get(':id/cover')
  async cover(@Param('id') id: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id }, select: { coverAssetId: true } })
    if (!item.coverAssetId) return new StreamableFile(Buffer.alloc(0), { type: 'image/png' })
    const result = await this.assets.readForAdmin(item.coverAssetId)
    return new StreamableFile(result.file, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name) })
  }

  @Get(':id/previews/:assetId')
  async preview(@Param('id') id: string, @Param('assetId') assetId: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id }, select: { options: true } })
    if (!this.previewAssetIds(item.options).includes(assetId)) throw new NotFoundException('预览图片不存在')
    const result = await this.assets.readForAdmin(assetId)
    return new StreamableFile(result.file, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name) })
  }

  @Get(':id/video')
  async video(@Param('id') id: string) {
    const item = await this.prisma.inspiration.findUniqueOrThrow({ where: { id }, select: { options: true } })
    const assetId = this.previewVideoAssetId(item.options)
    if (!assetId) throw new NotFoundException('演示视频不存在')
    const result = await this.assets.readForAdmin(assetId)
    return new StreamableFile(result.file, { type: result.mimeType, disposition: assetDisposition(result.mimeType, result.name) })
  }

  private record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
  private previewAssetIds(value: unknown) { const options = this.record(value); return Array.isArray(options.previewAssetIds) ? options.previewAssetIds.filter((item): item is string => typeof item === 'string').slice(0, 30) : [] }
  private previewVideoAssetId(value: unknown) { const id = this.record(value).previewVideoAssetId; return typeof id === 'string' && id ? id : undefined }
  private previewVideoUrl(value: unknown) { const url = this.record(value).previewVideoUrl; return typeof url === 'string' && /^(?:https?:\/\/|\/)/.test(url) ? url : '' }
}
