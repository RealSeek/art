import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { GenerationsModule } from '../generations/generations.module'
import { AgentTasksController } from './agent-tasks.controller'
import { AgentTasksProcessor } from './agent-tasks.processor'
import { AgentTasksService } from './agent-tasks.service'
import { AgentModelService } from './agent-model.service'
import { AgentToolsService } from './agent-tools.service'
import { AgentSchedulesService } from './agent-schedules.service'
import { AdminAgentTasksController } from './admin-agent-tasks.controller'
import { AdminGuard } from '../admin/admin.guard'
import { ProvidersModule } from '../providers/providers.module'

@Module({
  imports: [BullModule.registerQueue({ name: 'agent-task' }), GenerationsModule, ProvidersModule],
  controllers: [AgentTasksController, AdminAgentTasksController],
  providers: [AgentTasksService, AgentSchedulesService, AgentTasksProcessor, AgentModelService, AgentToolsService, AdminGuard],
})
export class AgentTasksModule {}
