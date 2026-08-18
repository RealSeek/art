import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

export interface AuthenticatedUser { id: string; email: string | null; username: string | null; displayName: string; authMethod: string; role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'; adminRoleId: string | null; mfaEnabled: boolean; mfaVerifiedAt: Date | null }
export type AuthenticatedRequest = FastifyRequest & { user: AuthenticatedUser; sessionId: string }
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest().user as AuthenticatedUser)
