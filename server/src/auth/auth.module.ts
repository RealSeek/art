import { Module } from '@nestjs/common'
import { ProvidersModule } from '../providers/providers.module'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { EmailService } from './email.service'

@Module({ imports: [ProvidersModule], controllers: [AuthController], providers: [AuthService, AuthGuard, EmailService], exports: [AuthGuard] })
export class AuthModule {}
