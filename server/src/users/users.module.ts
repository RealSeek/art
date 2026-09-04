import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { ProvidersModule } from '../providers/providers.module'

@Module({ imports: [ProvidersModule], controllers: [UsersController] })
export class UsersModule {}
