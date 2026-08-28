ALTER TABLE "GenerationJob"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "traceId" TEXT;

CREATE INDEX "GenerationJob_requestId_idx" ON "GenerationJob"("requestId");
CREATE INDEX "GenerationJob_traceId_idx" ON "GenerationJob"("traceId");

CREATE TABLE "GenerationEvent" (
  "id" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GenerationEvent_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GenerationEvent_generationId_sequence_key" ON "GenerationEvent"("generationId", "sequence");
CREATE INDEX "GenerationEvent_generationId_createdAt_idx" ON "GenerationEvent"("generationId", "createdAt");
CREATE INDEX "GenerationEvent_type_createdAt_idx" ON "GenerationEvent"("type", "createdAt");

CREATE TABLE "ProviderAttempt" (
  "id" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "upstreamCostMicros" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  CONSTRAINT "ProviderAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderAttempt_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProviderAttempt_generationId_startedAt_idx" ON "ProviderAttempt"("generationId", "startedAt");
CREATE INDEX "ProviderAttempt_provider_status_startedAt_idx" ON "ProviderAttempt"("provider", "status", "startedAt");
