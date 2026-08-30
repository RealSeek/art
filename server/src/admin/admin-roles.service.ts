import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ADMIN_PERMISSION_CATALOG } from './admin-permissions'

type RoleInput = { code: string; name: string; description?: string; permissions: string[]; enabled?: boolean }

@Injectable()
export class AdminRolesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.prisma.adminRole.upsert({
      where: { code: 'system_administrator' },
      update: { permissions: ['*'], builtIn: true, enabled: true },
      create: { id: 'role_system_administrator', code: 'system_administrator', name: '系统管理员', description: '拥有全部后台业务权限。', permissions: ['*'], builtIn: true },
    })
  }

  catalog() { return ADMIN_PERMISSION_CATALOG }
  list() { return this.prisma.adminRole.findMany({ orderBy: [{ builtIn: 'desc' }, { createdAt: 'asc' }], include: { _count: { select: { users: true } } } }) }
  administrators() {
    return this.prisma.user.findMany({ where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, status: { not: 'DELETED' } }, orderBy: [{ role: 'desc' }, { createdAt: 'asc' }], select: { id: true, email: true, username: true, displayName: true, role: true, status: true, adminRoleId: true, adminRole: true, lastLoginAt: true, createdAt: true } })
  }
  create(input: RoleInput) { return this.prisma.adminRole.create({ data: this.roleData(input, false) as Prisma.AdminRoleUncheckedCreateInput }) }

  async update(id: string, input: Partial<RoleInput>) {
    const role = await this.prisma.adminRole.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('后台角色不存在')
    if (role.builtIn && ((input.code && input.code !== role.code) || input.enabled === false)) throw new BadRequestException('系统内置角色不能停用或修改标识')
    return this.prisma.adminRole.update({ where: { id }, data: this.roleData(input, true) })
  }

  async remove(id: string) {
    const role = await this.prisma.adminRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
    if (!role) throw new NotFoundException('后台角色不存在')
    if (role.builtIn) throw new BadRequestException('系统内置角色不能删除')
    if (role._count.users) throw new BadRequestException('请先移除该角色下的管理员')
    await this.prisma.adminRole.delete({ where: { id } })
    return { deleted: true }
  }

  async assign(userId: string, adminRoleId: string | null, actorId: string) {
    if (userId === actorId && !adminRoleId) throw new BadRequestException('不能移除自己的后台角色')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) throw new NotFoundException('管理员不存在')
    if (user.role === UserRole.SUPER_ADMIN) throw new ForbiddenException('超级管理员不受自定义角色限制')
    if (adminRoleId && !await this.prisma.adminRole.findFirst({ where: { id: adminRoleId, enabled: true } })) throw new NotFoundException('后台角色不存在或已停用')
    return this.prisma.user.update({ where: { id: userId }, data: { adminRoleId }, select: { id: true, displayName: true, email: true, role: true, adminRole: true } })
  }

  private roleData(input: Partial<RoleInput>, partial: boolean): Prisma.AdminRoleUncheckedUpdateInput {
    const known = new Set(ADMIN_PERMISSION_CATALOG.map((item) => item.code))
    const permissions = input.permissions?.filter((code) => known.has(code))
    if (input.permissions && permissions?.length !== new Set(input.permissions).size) throw new BadRequestException('包含未知的后台权限')
    const code = input.code?.trim().toLowerCase()
    if (code && !/^[a-z][a-z0-9_-]{2,39}$/.test(code)) throw new BadRequestException('角色标识格式不正确')
    if (!partial && (!code || !input.name?.trim() || !permissions?.length)) throw new BadRequestException('请完整填写角色名称、标识和权限')
    return {
      ...(code === undefined ? {} : { code }),
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
      ...(permissions === undefined ? {} : { permissions: [...new Set(permissions)] }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    }
  }
}
