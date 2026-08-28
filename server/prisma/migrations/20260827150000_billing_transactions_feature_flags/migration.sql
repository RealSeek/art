CREATE TYPE "BillingTransactionType" AS ENUM ('PRE_AUTH', 'CAPTURE', 'REFUND', 'ADJUST');
CREATE TYPE "BillingTransactionDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "BillingTransactionStatus" AS ENUM ('RECORDED', 'VOID');
CREATE TYPE "FeatureFlagScope" AS ENUM ('GLOBAL', 'USER');

CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scope" "FeatureFlagScope" NOT NULL DEFAULT 'GLOBAL',
    "userIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingTransaction" (
    "id" TEXT NOT NULL,
    "generationId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "BillingTransactionType" NOT NULL,
    "direction" "BillingTransactionDirection" NOT NULL,
    "status" "BillingTransactionStatus" NOT NULL DEFAULT 'RECORDED',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CREDITS',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "upstreamCostMicros" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");
CREATE INDEX "FeatureFlag_scope_enabled_idx" ON "FeatureFlag"("scope", "enabled");
CREATE UNIQUE INDEX "BillingTransaction_idempotencyKey_key" ON "BillingTransaction"("idempotencyKey");
CREATE INDEX "BillingTransaction_generationId_createdAt_idx" ON "BillingTransaction"("generationId", "createdAt");
CREATE INDEX "BillingTransaction_userId_createdAt_idx" ON "BillingTransaction"("userId", "createdAt");
CREATE INDEX "BillingTransaction_type_status_createdAt_idx" ON "BillingTransaction"("type", "status", "createdAt");

ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
