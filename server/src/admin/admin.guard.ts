import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { permissionForAdminRequest } from './admin-permissions'

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const role = request.user?.role
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) throw new ForbiddenException('需要管理员权限')
    if (role !== 'SUPER_ADMIN') {
      const permission = permissionForAdminRequest(String(request.url || ''), String(request.method || 'GET'))
      const adminRole = request.user?.adminRoleId ? await this.prisma.adminRole.findFirst({ where: { id: request.user.adminRoleId, enabled: true }, select: { permissions: true } }) : null
      const permissions = adminRole?.permissions || []
      const resourceWildcard = `${permission.split('.')[0]}.*`
      if (!permissions.includes('*') && !permissions.includes(permission) && !permissions.includes(resourceWildcard)) throw new ForbiddenException(`缺少后台权限：${permission}`)
    }
    return true
  }
}
