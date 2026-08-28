import { Type } from "class-transformer";
import { Prisma } from "@prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export const WORKFLOW_STATUSES = [
  "PLANNING",
  "IN_PROGRESS",
  "REVIEW",
  "COMPLETED",
  "ARCHIVED",
] as const;
const STEP_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;

export class WorkflowStepDto {
  @IsString() @MinLength(1) @MaxLength(100) id!: string;
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsIn(STEP_STATUSES) status!: (typeof STEP_STATUSES)[number];
}

export class WorkflowConfigDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
  @IsOptional() @IsString() @MaxLength(10_000) defaultPrompt?: string;
  @IsOptional() @IsString() @MaxLength(10_000) outputRequirements?: string;
}

export class ProjectDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsOptional()
  @IsIn(WORKFLOW_STATUSES)
  workflowStatus?: (typeof WORKFLOW_STATUSES)[number];
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowConfigDto)
  workflowConfig?: WorkflowConfigDto;
  @IsOptional() @IsString() @MaxLength(160) defaultModel?: string;
  @IsOptional() @IsString() @MaxLength(100) defaultAssistantId?: string | null;
}

export class UpdateProjectDto extends ProjectDto {
  @IsOptional() declare name: string;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
  @IsOptional() @IsString() @MaxLength(80) versionLabel?: string;
}

export class AdminCreateProjectDto extends ProjectDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(100) userId!: string;
}

export class AdminUpdateProjectDto extends UpdateProjectDto {}

export class WorkflowDto {
  @IsIn(WORKFLOW_STATUSES) workflowStatus!: (typeof WORKFLOW_STATUSES)[number];
  @ValidateNested()
  @Type(() => WorkflowConfigDto)
  workflowConfig!: WorkflowConfigDto;
  @IsOptional() @IsString() @MaxLength(160) defaultModel?: string;
  @IsOptional() @IsString() @MaxLength(100) defaultAssistantId?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
  @IsOptional() @IsString() @MaxLength(80) versionLabel?: string;
}

export class CreateVersionDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
}

export class ProjectMemberDto {
  @IsEmail() email!: string;
  @IsOptional() @IsIn(["ADMIN", "MEMBER"]) role?: "ADMIN" | "MEMBER";
}

export class ProjectMemberRoleDto {
  @IsIn(["ADMIN", "MEMBER"]) role!: "ADMIN" | "MEMBER";
}

export class AssignProjectTeamDto {
  @IsOptional() @IsString() @MaxLength(100) teamId?: string | null;
}

export type ProjectSnapshotSource = {
  name: string;
  description: string;
  instructions: string;
  workflowStatus: string;
  workflowConfig: Prisma.JsonValue | null;
  defaultModel: string;
  defaultAssistantId: string | null;
  revision: number;
};

