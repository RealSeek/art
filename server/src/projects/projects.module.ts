import { Module } from "@nestjs/common";
import {
  AdminProjectsController,
  ProjectsController,
} from "./projects.controller";

@Module({ controllers: [ProjectsController, AdminProjectsController] })
export class ProjectsModule {}
