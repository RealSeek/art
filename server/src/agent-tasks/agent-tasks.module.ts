import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { GenerationsModule } from '../generations/generations.module'
import { AgentTasksController } from './agent-tasks.controller'
import { AgentTasksProcessor } from './agent-tasks.processor'
import { AgentTasksService } from './agent-tasks.service'

@Module({
  imports: [BullModule.registerQueue({ name: 'agent-task' }), GenerationsModule],
  controllers: [AgentTasksController],
  providers: [AgentTasksService, AgentTasksProcessor],
})
export class AgentTasksModule {}
