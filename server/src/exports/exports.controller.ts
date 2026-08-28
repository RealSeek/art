import { Body, Controller, Get, Param, Post, StreamableFile, UseGuards } from '@nestjs/common'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { ExportsService, ExportScope } from './exports.service'

class CreateExportDto {
  @IsOptional() @IsIn(['ACCOUNT', 'TEAM']) scope?: ExportScope
  @IsOptional() @IsString() teamId?: string
}

@Controller('exports')
@UseGuards(AuthGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateExportDto) { return this.exports.create(user.id, body.scope || 'ACCOUNT', body.teamId) }
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) { return this.exports.list(user.id) }
  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.exports.get(user.id, id) }
  @Get(':id/download')
  async download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const row = await this.exports.download(user.id, id)
    await stat(row.filePath)
    return new StreamableFile(createReadStream(row.filePath), { type: 'application/json', disposition: "attachment; filename*=UTF-8''" + encodeURIComponent(row.fileName) })
  }
}
