CREATE TYPE "AgentTaskStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AgentTaskStepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "AgentTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT,
  "assistantId" TEXT,
  "conversationId" TEXT,
  "generationJobId" TEXT,
  "title" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "instructions" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL,
  "pluginId" TEXT,
  "attachmentIds" JSONB,
  "status" "AgentTaskStatus" NOT NULL DEFAULT 'DRAFT',
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTaskStep" (
  "id" TEXT NOT NULL,
  "agentTaskId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "status" "AgentTaskStepStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentTaskStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentTask_conversationId_key" ON "AgentTask"("conversationId");
CREATE UNIQUE INDEX "AgentTask_generationJobId_key" ON "AgentTask"("generationJobId");
CREATE INDEX "AgentTask_userId_updatedAt_idx" ON "AgentTask"("userId", "updatedAt");
CREATE INDEX "AgentTask_userId_status_idx" ON "AgentTask"("userId", "status");
CREATE INDEX "AgentTask_projectId_idx" ON "AgentTask"("projectId");
CREATE INDEX "AgentTask_assistantId_idx" ON "AgentTask"("assistantId");
CREATE UNIQUE INDEX "AgentTaskStep_agentTaskId_position_key" ON "AgentTaskStep"("agentTaskId", "position");
CREATE INDEX "AgentTaskStep_agentTaskId_position_idx" ON "AgentTaskStep"("agentTaskId", "position");

ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentTaskStep" ADD CONSTRAINT "AgentTaskStep_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
