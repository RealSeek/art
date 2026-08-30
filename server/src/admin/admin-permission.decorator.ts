import { SetMetadata } from '@nestjs/common'

export const ADMIN_PERMISSION_METADATA = 'admin:required-permission'
export const ADMIN_SUPER_ONLY_METADATA = 'admin:super-admin-only'

export const RequireAdminPermission = (permission: string) => SetMetadata(ADMIN_PERMISSION_METADATA, permission)
export const RequireSuperAdmin = () => SetMetadata(ADMIN_SUPER_ONLY_METADATA, true)
