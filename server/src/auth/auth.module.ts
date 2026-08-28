import { forwardRef, Module } from '@nestjs/common'
import { ProvidersModule } from '../providers/providers.module'
import { CommercialModule } from '../commercial/commercial.module'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { EmailService } from './email.service'

@Module({ imports: [ProvidersModule, forwardRef(() => CommercialModule)], controllers: [AuthController], providers: [AuthService, AuthGuard, EmailService], exports: [AuthGuard, EmailService] })
export class AuthModule {}
