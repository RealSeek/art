import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const role = context.switchToHttp().getRequest().user?.role
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) throw new ForbiddenException('需要管理员权限')
    return true
  }
}
