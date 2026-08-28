import { Module } from "@nestjs/common";
import {
  ProjectsController,
} from "./projects.controller";
import { AdminProjectsController } from "./admin-projects.controller";
import { ProvidersModule } from "../providers/providers.module";
import { ProjectSkillsController } from "./project-skills.controller";
import { ProjectSkillsService } from "./project-skills.service";

@Module({ imports: [ProvidersModule], controllers: [ProjectsController, AdminProjectsController, ProjectSkillsController], providers: [ProjectSkillsService] })
export class ProjectsModule {}
