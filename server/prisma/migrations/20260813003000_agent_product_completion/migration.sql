ALTER TABLE "ToolDefinition"
ADD COLUMN "httpMethod" TEXT NOT NULL DEFAULT 'POST',
ADD COLUMN "timeoutMs" INTEGER NOT NULL DEFAULT 45000,
ADD COLUMN "headers" JSONB,
ADD COLUMN "encryptedHeaders" TEXT NOT NULL DEFAULT '',
ADD COLUMN "secretHeaderHints" JSONB,
ADD COLUMN "inputSchema" JSONB;

CREATE TABLE "AgentSchedule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "instructions" TEXT NOT NULL DEFAULT '',
  "model" TEXT NOT NULL,
  "skillId" TEXT NOT NULL DEFAULT 'daily',
  "assistantId" TEXT,
  "projectId" TEXT,
  "pluginId" TEXT,
  "attachmentIds" JSONB,
  "cronExpression" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastTaskId" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentSchedule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentTask"
ADD COLUMN "sourceTaskId" TEXT,
ADD COLUMN "scheduleId" TEXT,
ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "AgentSchedule_userId_enabled_updatedAt_idx" ON "AgentSchedule"("userId", "enabled", "updatedAt");
CREATE INDEX "AgentSchedule_enabled_nextRunAt_idx" ON "AgentSchedule"("enabled", "nextRunAt");
CREATE INDEX "AgentTask_userId_archivedAt_updatedAt_idx" ON "AgentTask"("userId", "archivedAt", "updatedAt");
CREATE INDEX "AgentTask_scheduleId_scheduledFor_idx" ON "AgentTask"("scheduleId", "scheduledFor");
CREATE UNIQUE INDEX "AgentTask_scheduleId_scheduledFor_key" ON "AgentTask"("scheduleId", "scheduledFor");

ALTER TABLE "AgentSchedule" ADD CONSTRAINT "AgentSchedule_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "AgentSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
