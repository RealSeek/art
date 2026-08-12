import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { CreditsService } from './credits.service'

@Controller('credits')
@UseGuards(AuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}
  @Get() balance(@CurrentUser() user: AuthenticatedUser) { return this.credits.balance(user.id) }
  @Get('ledger') entries(@CurrentUser() user: AuthenticatedUser, @Query('take') take?: string) { return this.credits.entries(user.id, Number(take || 50)) }
}
