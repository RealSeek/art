import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { CanvasesService } from './canvases.service'

class CreateCanvasDto {
  @IsString() @MinLength(1) @MaxLength(100) title!: string
  @IsOptional() @IsString() @MaxLength(100) projectId?: string
  @IsOptional() @IsIn(['FREEFORM', 'SHORT_DRAMA']) kind?: 'FREEFORM' | 'SHORT_DRAMA'
  @IsOptional() @IsObject() document?: Record<string, unknown>
}

class UpdateCanvasDto {
  @IsInt() @Min(1) expectedRevision!: number
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) title?: string
  @IsOptional() @IsObject() document?: Record<string, unknown>
  @IsOptional() @IsBoolean() archived?: boolean
}

class DuplicateCanvasDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) title?: string
}

@Controller('canvases')
@UseGuards(AuthGuard)
export class CanvasesController {
  constructor(private readonly canvases: CanvasesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('archived') archived?: string, @Query('q') query?: string) {
    return this.canvases.list(user.id, archived === 'true', query)
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateCanvasDto) {
    return this.canvases.create(user.id, body)
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.canvases.capabilities(user.id)
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.canvases.get(user.id, id)
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateCanvasDto) {
    return this.canvases.update(user.id, id, body)
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: DuplicateCanvasDto) {
    return this.canvases.duplicate(user.id, id, body.title)
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.canvases.remove(user.id, id)
  }
}
