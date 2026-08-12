CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "agentTaskId" TEXT NOT NULL,
  "runKey" TEXT NOT NULL,
  "status" "AgentTaskStatus" NOT NULL DEFAULT 'QUEUED',
  "currentNode" TEXT NOT NULL DEFAULT 'prepare',
  "iteration" INTEGER NOT NULL DEFAULT 0,
  "maxIterations" INTEGER NOT NULL DEFAULT 3,
  "plan" JSONB,
  "context" JSONB,
  "verifierFeedback" TEXT NOT NULL DEFAULT '',
  "finalAnswer" TEXT NOT NULL DEFAULT '',
  "artifactIds" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentEvent" (
  "id" TEXT NOT NULL,
  "agentTaskId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentToolCall" (
  "id" TEXT NOT NULL,
  "agentTaskId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "toolId" TEXT,
  "iteration" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRun_runKey_key" ON "AgentRun"("runKey");
CREATE INDEX "AgentRun_agentTaskId_createdAt_idx" ON "AgentRun"("agentTaskId", "createdAt");
CREATE INDEX "AgentRun_status_updatedAt_idx" ON "AgentRun"("status", "updatedAt");
CREATE INDEX "AgentEvent_agentTaskId_createdAt_idx" ON "AgentEvent"("agentTaskId", "createdAt");
CREATE INDEX "AgentEvent_runId_createdAt_idx" ON "AgentEvent"("runId", "createdAt");
CREATE UNIQUE INDEX "AgentToolCall_runId_iteration_position_key" ON "AgentToolCall"("runId", "iteration", "position");
CREATE INDEX "AgentToolCall_agentTaskId_status_createdAt_idx" ON "AgentToolCall"("agentTaskId", "status", "createdAt");
CREATE INDEX "AgentToolCall_toolId_createdAt_idx" ON "AgentToolCall"("toolId", "createdAt");

ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_agentTaskId_fkey" FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
