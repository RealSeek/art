CREATE TYPE "WebSearchProviderType" AS ENUM ('TAVILY', 'SERPER', 'BRAVE', 'EXA', 'CUSTOM');

ALTER TABLE "AgentTask" ADD COLUMN "webSearchEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AgentSchedule" ADD COLUMN "webSearchEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "WebSearchChannel" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "WebSearchProviderType" NOT NULL,
  "endpoint" TEXT NOT NULL,
  "encryptedApiKey" TEXT NOT NULL DEFAULT '',
  "apiKeyHint" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "maxResults" INTEGER NOT NULL DEFAULT 8,
  "config" JSONB,
  "lastHealthStatus" TEXT,
  "lastHealthMessage" TEXT NOT NULL DEFAULT '',
  "lastHealthAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "cooldownUntil" TIMESTAMP(3),
  "totalRequests" INTEGER NOT NULL DEFAULT 0,
  "totalFailures" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebSearchChannel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebSearchChannel_enabled_priority_createdAt_idx" ON "WebSearchChannel"("enabled", "priority", "createdAt");
CREATE INDEX "WebSearchChannel_enabled_cooldownUntil_idx" ON "WebSearchChannel"("enabled", "cooldownUntil");
