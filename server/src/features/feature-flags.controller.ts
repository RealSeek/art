import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common'
import { FeatureFlagScope, Prisma } from '@prisma/client'
import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { FeatureFlagsService } from './feature-flags.service'

class UpdateFeatureFlagDto {
  @IsBoolean() enabled!: boolean
  @IsEnum(FeatureFlagScope) scope!: FeatureFlagScope
  @IsOptional() @IsArray() @IsString({ each: true }) userIds?: string[]
  @IsOptional() @IsObject() metadata?: Record<string, unknown>
}

@Controller('admin/feature-flags')
@UseGuards(AuthGuard, AdminGuard)
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  list() { return this.flags.list() }

  @Put(':key')
  update(@Param('key') key: string, @Body() body: UpdateFeatureFlagDto) {
    return this.flags.upsert(key.trim(), { ...body, metadata: body.metadata as Prisma.InputJsonValue | undefined })
  }

  @Delete(':key')
  remove(@Param('key') key: string) { return this.flags.remove(key.trim()) }
}
