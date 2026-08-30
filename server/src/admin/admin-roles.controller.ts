import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { AdminGuard } from './admin.guard'
import { RequireSuperAdmin } from './admin-permission.decorator'
import { AdminRolesService } from './admin-roles.service'

class RoleDto { @IsString() @MinLength(3) @MaxLength(40) code!: string; @IsString() @MinLength(1) @MaxLength(80) name!: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsArray() @IsString({ each: true }) permissions!: string[]; @IsOptional() @IsBoolean() enabled?: boolean }
class UpdateRoleDto { @IsOptional() @IsString() @MinLength(3) @MaxLength(40) code?: string; @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[]; @IsOptional() @IsBoolean() enabled?: boolean }
class AssignRoleDto { @IsOptional() @IsString() adminRoleId?: string | null }

@Controller('admin/roles')
@UseGuards(AuthGuard, AdminGuard)
export class AdminRolesController {
  constructor(private readonly roles: AdminRolesService, private readonly prisma: PrismaService) {}
  @Get('catalog') catalog() { return this.roles.catalog() }
  @Get('administrators') administrators() { return this.roles.administrators() }
  @Get() list() { return this.roles.list() }
  @Post() @RequireSuperAdmin() async create(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Body() body: RoleDto) { const result = await this.roles.create(body); await this.audit(admin.id, request, 'admin.role.create', result.id, result); return result }
  @Patch('administrators/:userId') @RequireSuperAdmin() async assign(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('userId') userId: string, @Body() body: AssignRoleDto) { const result = await this.roles.assign(userId, body.adminRoleId || null, admin.id); await this.audit(admin.id, request, 'admin.role.assign', userId, result); return result }
  @Patch(':id') @RequireSuperAdmin() async update(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: UpdateRoleDto) { const result = await this.roles.update(id, body); await this.audit(admin.id, request, 'admin.role.update', id, result); return result }
  @Delete(':id') @RequireSuperAdmin() async remove(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) { const result = await this.roles.remove(id); await this.audit(admin.id, request, 'admin.role.delete', id, result); return result }

  private async audit(actorId: string, request: FastifyRequest, action: string, targetId: string, after: unknown) {
    await this.prisma.auditLog.create({ data: { actorId, action, targetType: 'admin_role', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: after as Prisma.InputJsonValue } })
  }
}
