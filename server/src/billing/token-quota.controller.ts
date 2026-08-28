import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { TokenQuotaService } from './token-quota.service'

@Controller('billing/token-quota')
@UseGuards(AuthGuard)
export class TokenQuotaController {
  constructor(private readonly quotas: TokenQuotaService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.quotas.summary(user.id)
  }

  @Get('events')
  events(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.quotas.events(user.id, Number(limit || 100))
  }
}
