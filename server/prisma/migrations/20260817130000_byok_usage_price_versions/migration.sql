ALTER TABLE "UserApiCredential"
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "lastRotatedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "totalRequests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inputTokens" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "outputTokens" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "ModelPriceVersion" (
  "id" TEXT NOT NULL,
  "modelPresetId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "flatCreditCost" INTEGER NOT NULL,
  "inputCreditsPerMillion" INTEGER NOT NULL,
  "outputCreditsPerMillion" INTEGER NOT NULL,
  "inputCostMicrosPerMillion" INTEGER NOT NULL,
  "outputCostMicrosPerMillion" INTEGER NOT NULL,
  "imageCostMicros" INTEGER NOT NULL,
  "videoCostMicros" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelPriceVersion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ModelPriceVersion" ("id", "modelPresetId", "version", "flatCreditCost", "inputCreditsPerMillion", "outputCreditsPerMillion", "inputCostMicrosPerMillion", "outputCostMicrosPerMillion", "imageCostMicros", "videoCostMicros")
SELECT md5(random()::text || "id" || clock_timestamp()::text), "id", 1, "flatCreditCost", "inputCreditsPerMillion", "outputCreditsPerMillion", "inputCostMicrosPerMillion", "outputCostMicrosPerMillion", "imageCostMicros", "videoCostMicros"
FROM "ModelPreset";

ALTER TABLE "GenerationJob"
  ADD COLUMN "userCredentialId" TEXT,
  ADD COLUMN "userModelRouteId" TEXT,
  ADD COLUMN "priceVersionId" TEXT,
  ADD COLUMN "pricingSnapshot" JSONB;

UPDATE "GenerationJob" AS job
SET "priceVersionId" = version."id"
FROM "ModelPriceVersion" AS version, "ModelPreset" AS preset
WHERE version."modelPresetId" = preset."id"
  AND version."version" = 1
  AND job."options"->>'presetKey' = preset."key";

CREATE UNIQUE INDEX "ModelPriceVersion_modelPresetId_version_key" ON "ModelPriceVersion"("modelPresetId", "version");
CREATE INDEX "ModelPriceVersion_modelPresetId_effectiveAt_idx" ON "ModelPriceVersion"("modelPresetId", "effectiveAt");
CREATE INDEX "GenerationJob_userCredentialId_createdAt_idx" ON "GenerationJob"("userCredentialId", "createdAt");
CREATE INDEX "GenerationJob_userModelRouteId_createdAt_idx" ON "GenerationJob"("userModelRouteId", "createdAt");
CREATE INDEX "GenerationJob_priceVersionId_idx" ON "GenerationJob"("priceVersionId");

ALTER TABLE "ModelPriceVersion" ADD CONSTRAINT "ModelPriceVersion_modelPresetId_fkey" FOREIGN KEY ("modelPresetId") REFERENCES "ModelPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userCredentialId_fkey" FOREIGN KEY ("userCredentialId") REFERENCES "UserApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userModelRouteId_fkey" FOREIGN KEY ("userModelRouteId") REFERENCES "UserModelRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "ModelPriceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
