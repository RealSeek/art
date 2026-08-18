import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable } from '@nestjs/common'
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
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!request.user?.mfaEnabled) throw new HttpException({ code: 'ADMIN_MFA_REQUIRED', message: '执行管理写操作前必须先在“业务系统配置 > 后台安全”启用 MFA' }, 428)
      const verifiedAt = request.user.mfaVerifiedAt ? new Date(request.user.mfaVerifiedAt).getTime() : 0
      if (!verifiedAt || Date.now() - verifiedAt > 15 * 60_000) throw new HttpException({ code: 'ADMIN_MFA_STEP_UP_REQUIRED', message: '安全验证已超过 15 分钟，请在“后台安全”验证当前会话后重试' }, 428)
    }
    return true
  }
}
