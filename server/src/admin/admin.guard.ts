import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma/prisma.service'
import { ADMIN_PERMISSION_METADATA, ADMIN_SUPER_ONLY_METADATA } from './admin-permission.decorator'
import { isKnownAdminPermission, permissionForAdminRequest } from './admin-permissions'

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const role = request.user?.role
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) throw new ForbiddenException('需要管理员权限')
    if (role !== 'SUPER_ADMIN') {
      const superAdminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_SUPER_ONLY_METADATA, [context.getHandler(), context.getClass()])
      if (superAdminOnly) throw new ForbiddenException('该操作仅限超级管理员')
      const declaredPermission = this.reflector.getAllAndOverride<string>(ADMIN_PERMISSION_METADATA, [context.getHandler(), context.getClass()])
      const permission = declaredPermission || permissionForAdminRequest(String(request.url || ''), String(request.method || 'GET'))
      if (!permission || !isKnownAdminPermission(permission)) throw new ForbiddenException('后台接口未配置权限')
      const adminRole = request.user?.adminRoleId ? await this.prisma.adminRole.findFirst({ where: { id: request.user.adminRoleId, enabled: true }, select: { permissions: true } }) : null
      const permissions = adminRole?.permissions || []
      const resourceWildcard = `${permission.split('.')[0]}.*`
      if (!permissions.includes('*') && !permissions.includes(permission) && !permissions.includes(resourceWildcard)) throw new ForbiddenException(`缺少后台权限：${permission}`)
    }
    return true
  }
}
