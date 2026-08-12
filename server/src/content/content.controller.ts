import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { PrismaService } from '../prisma/prisma.service'

class CreateContentPageDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string
  @IsString() @MinLength(1) @MaxLength(120) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug 只能包含小写字母、数字和连字符' }) slug!: string
  @IsOptional() @IsString() @MaxLength(80) category?: string
  @IsOptional() @IsString() @MaxLength(1000) summary?: string
  @IsString() @MinLength(1) @MaxLength(500000) contentHtml!: string
  @IsOptional() @IsString() @MaxLength(2000) coverUrl?: string
  @IsOptional() @IsBoolean() published?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

class UpdateContentPageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug 只能包含小写字母、数字和连字符' }) slug?: string
  @IsOptional() @IsString() @MaxLength(80) category?: string
  @IsOptional() @IsString() @MaxLength(1000) summary?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500000) contentHtml?: string
  @IsOptional() @IsString() @MaxLength(2000) coverUrl?: string
  @IsOptional() @IsBoolean() published?: boolean
  @IsOptional() @IsInt() @Min(-10000) @Max(10000) sortOrder?: number
}

@Controller('admin/content-pages')
@UseGuards(AuthGuard, AdminGuard)
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('q') q?: string, @Query('category') category?: string, @Query('published') published?: string, @Query('page') rawPage?: string, @Query('pageSize') rawPageSize?: string) {
    const page = Math.max(1, Number(rawPage) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(rawPageSize) || 20))
    const where: Prisma.ContentPageWhereInput = {
      category: category || undefined,
      published: published === 'true' ? true : published === 'false' ? false : undefined,
      OR: q ? [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] : undefined,
    }
    const [items, total] = await Promise.all([
      this.prisma.contentPage.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.contentPage.count({ where }),
    ])
    return { items, total, page, pageSize }
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const page = await this.prisma.contentPage.findUnique({ where: { id } })
    if (!page) throw new BadRequestException('内容不存在')
    return page
  }

  @Post()
  async create(@Body() body: CreateContentPageDto) {
    try {
      return await this.prisma.contentPage.create({ data: this.toData(body) as Prisma.ContentPageCreateInput })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('内容路径已存在')
      throw error
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateContentPageDto) {
    try {
      return await this.prisma.contentPage.update({ where: { id }, data: this.toData(body) })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('内容路径已存在')
      throw error
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.contentPage.delete({ where: { id } })
    return { deleted: true }
  }

  private toData(body: CreateContentPageDto | UpdateContentPageDto) {
    const data = { ...body, title: body.title?.trim(), slug: body.slug?.trim(), category: body.category?.trim(), summary: body.summary?.trim(), coverUrl: body.coverUrl?.trim() }
    return { ...data, publishedAt: body.published === true ? new Date() : body.published === false ? null : undefined }
  }
}

@Controller('content-pages')
export class PublicContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.contentPage.findMany({ where: { published: true }, orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }], select: { id: true, slug: true, title: true, category: true, summary: true, coverUrl: true, publishedAt: true, updatedAt: true } })
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    const page = await this.prisma.contentPage.findFirst({ where: { slug, published: true } })
    if (!page) throw new BadRequestException('内容不存在或尚未发布')
    await this.prisma.contentPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } })
    return { ...page, views: page.views + 1 }
  }
}
