CREATE TYPE "GenerationSettlementStatus" AS ENUM ('PENDING', 'RESERVED', 'SETTLED', 'RELEASED', 'REFUNDED', 'RECONCILING');
CREATE TYPE "TokenQuotaMode" AS ENUM ('BILLABLE_UNITS');
CREATE TYPE "TokenOverageMode" AS ENUM ('BLOCK', 'OVERAGE_CREDITS');
CREATE TYPE "ByokQuotaMode" AS ENUM ('QUOTA', 'FREE');
CREATE TYPE "TokenQuotaStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'EXHAUSTED');
CREATE TYPE "TokenUsageSource" AS ENUM ('PROVIDER', 'TOKENIZER', 'RESERVED', 'MANUAL');
CREATE TYPE "TokenSettlementStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED', 'REFUNDED', 'RECONCILING');
CREATE TYPE "TokenLedgerType" AS ENUM ('RESERVE', 'CHARGE', 'RELEASE', 'REFUND', 'ADJUST');
CREATE TYPE "TokenQuotaEventType" AS ENUM ('GRANT', 'RESERVE', 'RELEASE', 'CHARGE', 'REFUND', 'EXPIRE', 'ADJUST');

ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "monthlyQuotaUnits" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "tokenQuotaMode" "TokenQuotaMode" NOT NULL DEFAULT 'BILLABLE_UNITS',
  ADD COLUMN "tokenOverageMode" "TokenOverageMode" NOT NULL DEFAULT 'BLOCK',
  ADD COLUMN "tokenOverageRate" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tokenQuotaCarryOver" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tokenQuotaResetDay" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "dailyQuotaUnits" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "byokMode" "ByokQuotaMode" NOT NULL DEFAULT 'QUOTA';

ALTER TABLE "GenerationJob"
  ADD COLUMN "settlementStatus" "GenerationSettlementStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "SubscriptionPlan" SET "monthlyQuotaUnits" = 1000000, "dailyQuotaUnits" = 100000 WHERE "code" = 'free' AND "monthlyQuotaUnits" = 0;
UPDATE "SubscriptionPlan" SET "monthlyQuotaUnits" = 10000000, "dailyQuotaUnits" = 1000000 WHERE "code" = 'plus' AND "monthlyQuotaUnits" = 0;
UPDATE "SubscriptionPlan" SET "monthlyQuotaUnits" = 50000000, "dailyQuotaUnits" = 5000000 WHERE "code" = 'pro' AND "monthlyQuotaUnits" = 0;

CREATE TABLE "UserTokenQuota" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "grantedUnits" BIGINT NOT NULL DEFAULT 0,
  "reservedUnits" BIGINT NOT NULL DEFAULT 0,
  "usedUnits" BIGINT NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" BIGINT NOT NULL DEFAULT 0,
  "outputTokens" BIGINT NOT NULL DEFAULT 0,
  "cachedInputTokens" BIGINT NOT NULL DEFAULT 0,
  "reasoningTokens" BIGINT NOT NULL DEFAULT 0,
  "status" "TokenQuotaStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserTokenQuota_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserTokenQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserTokenQuota_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserTokenQuota_userId_scopeKey_periodStart_key" ON "UserTokenQuota"("userId", "scopeKey", "periodStart");
CREATE INDEX "UserTokenQuota_userId_status_periodEnd_idx" ON "UserTokenQuota"("userId", "status", "periodEnd");
CREATE INDEX "UserTokenQuota_subscriptionId_periodStart_idx" ON "UserTokenQuota"("subscriptionId", "periodStart");

CREATE TABLE "TokenUsageLedger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "quotaId" TEXT,
  "subscriptionId" TEXT,
  "model" TEXT NOT NULL,
  "provider" TEXT,
  "providerRequestId" TEXT,
  "providerAttemptId" TEXT,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
  "reservedUnits" BIGINT NOT NULL DEFAULT 0,
  "chargedUnits" BIGINT NOT NULL DEFAULT 0,
  "inputRate" INTEGER NOT NULL DEFAULT 0,
  "outputRate" INTEGER NOT NULL DEFAULT 0,
  "pricingSnapshot" JSONB NOT NULL,
  "usageSource" "TokenUsageSource" NOT NULL,
  "settlementStatus" "TokenSettlementStatus" NOT NULL,
  "type" "TokenLedgerType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TokenUsageLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TokenUsageLedger_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "TokenUsageLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TokenUsageLedger_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TokenUsageLedger_quotaId_fkey" FOREIGN KEY ("quotaId") REFERENCES "UserTokenQuota"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "TokenUsageLedger_generationId_createdAt_idx" ON "TokenUsageLedger"("generationId", "createdAt");
CREATE INDEX "TokenUsageLedger_userId_createdAt_idx" ON "TokenUsageLedger"("userId", "createdAt");
CREATE INDEX "TokenUsageLedger_quotaId_createdAt_idx" ON "TokenUsageLedger"("quotaId", "createdAt");
CREATE INDEX "TokenUsageLedger_usageSource_createdAt_idx" ON "TokenUsageLedger"("usageSource", "createdAt");

CREATE TABLE "TokenQuotaEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quotaId" TEXT NOT NULL,
  "generationId" TEXT,
  "type" "TokenQuotaEventType" NOT NULL,
  "units" BIGINT NOT NULL,
  "balanceBefore" BIGINT NOT NULL,
  "balanceAfter" BIGINT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TokenQuotaEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TokenQuotaEvent_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "TokenQuotaEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TokenQuotaEvent_quotaId_fkey" FOREIGN KEY ("quotaId") REFERENCES "UserTokenQuota"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TokenQuotaEvent_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "TokenQuotaEvent_userId_createdAt_idx" ON "TokenQuotaEvent"("userId", "createdAt");
CREATE INDEX "TokenQuotaEvent_quotaId_createdAt_idx" ON "TokenQuotaEvent"("quotaId", "createdAt");
CREATE INDEX "TokenQuotaEvent_generationId_createdAt_idx" ON "TokenQuotaEvent"("generationId", "createdAt");
CREATE INDEX "TokenQuotaEvent_type_createdAt_idx" ON "TokenQuotaEvent"("type", "createdAt");
