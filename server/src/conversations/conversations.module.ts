import { Module } from '@nestjs/common'
import { ModerationModule } from '../moderation/moderation.module'
import { ConversationsController, ConversationSharesController } from './conversations.controller'

@Module({ imports: [ModerationModule], controllers: [ConversationsController, ConversationSharesController] })
export class ConversationsModule {}
