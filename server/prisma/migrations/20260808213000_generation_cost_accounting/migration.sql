ALTER TABLE "ModelPreset"
  ADD COLUMN "inputCostMicrosPerMillion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outputCostMicrosPerMillion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "imageCostMicros" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ModelProviderRoute"
  ADD COLUMN "inputCostMicrosPerMillion" INTEGER,
  ADD COLUMN "outputCostMicrosPerMillion" INTEGER,
  ADD COLUMN "imageCostMicros" INTEGER;

ALTER TABLE "SystemSetting"
  ADD COLUMN "creditValueMicros" INTEGER NOT NULL DEFAULT 10000;

ALTER TABLE "GenerationJob"
  ADD COLUMN "revenueMicros" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "upstreamCostMicros" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0;

UPDATE "GenerationJob"
SET "revenueMicros" = "creditCost" * 10000
WHERE "creditCost" > 0;

CREATE INDEX "GenerationJob_completedAt_status_idx" ON "GenerationJob"("completedAt", "status");
