-- Commercial subscriptions, privacy controls, temporary chats and provider failover.
CREATE TYPE "PlanBillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
CREATE TYPE "SubscriptionOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

ALTER TABLE "UserSettings"
  ADD COLUMN "chatHistoryEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trainingOptOut" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "temporaryChatDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dataRetentionDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shareUsageAnalytics" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Conversation"
  ADD COLUMN "temporary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "Conversation_temporary_expiresAt_idx" ON "Conversation"("temporary", "expiresAt");

ALTER TABLE "ProviderChannel"
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastFailureAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
  ADD COLUMN "cooldownUntil" TIMESTAMP(3);

ALTER TABLE "SystemSetting"
  ADD COLUMN "subscriptionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trialEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "defaultTrialPlanId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "trialCredits" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "defaultUserGroupId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "temporaryChatRetentionHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "defaultChatHistoryEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "defaultTrainingOptOut" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "defaultShareUsageAnalytics" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ModelProviderRoute" (
  "id" TEXT NOT NULL,
  "modelPresetId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "upstreamModelOverride" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER,
  "weight" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelProviderRoute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelProviderRoute_modelPresetId_providerId_key" ON "ModelProviderRoute"("modelPresetId", "providerId");
CREATE INDEX "ModelProviderRoute_modelPresetId_enabled_idx" ON "ModelProviderRoute"("modelPresetId", "enabled");
CREATE INDEX "ModelProviderRoute_providerId_enabled_idx" ON "ModelProviderRoute"("providerId", "enabled");
ALTER TABLE "ModelProviderRoute" ADD CONSTRAINT "ModelProviderRoute_modelPresetId_fkey" FOREIGN KEY ("modelPresetId") REFERENCES "ModelPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelProviderRoute" ADD CONSTRAINT "ModelProviderRoute_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ModelProviderRoute" ("id", "modelPresetId", "providerId", "upstreamModelOverride", "enabled", "createdAt", "updatedAt")
SELECT 'route_' || md5("id" || "providerId"), "id", "providerId", "upstreamModel", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ModelPreset" WHERE "providerId" IS NOT NULL
ON CONFLICT ("modelPresetId", "providerId") DO NOTHING;

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "billingCycle" "PlanBillingCycle" NOT NULL DEFAULT 'MONTHLY', "priceCents" INTEGER NOT NULL DEFAULT 0,
  "originalPriceCents" INTEGER, "currency" TEXT NOT NULL DEFAULT 'CNY', "includedCredits" INTEGER NOT NULL DEFAULT 0,
  "trialDays" INTEGER NOT NULL DEFAULT 0, "concurrency" INTEGER NOT NULL DEFAULT 1, "allowByok" BOOLEAN NOT NULL DEFAULT true,
  "apiAccess" BOOLEAN NOT NULL DEFAULT false, "imageAccess" BOOLEAN NOT NULL DEFAULT true, "commerceAccess" BOOLEAN NOT NULL DEFAULT false,
  "batchAccess" BOOLEAN NOT NULL DEFAULT false, "enabled" BOOLEAN NOT NULL DEFAULT true, "recommended" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "capabilities" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE INDEX "SubscriptionPlan_enabled_sortOrder_idx" ON "SubscriptionPlan"("enabled", "sortOrder");

CREATE TABLE "UserSubscription" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE', "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "currentPeriodEnd" TIMESTAMP(3), "trialEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false, "cancelledAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserSubscription_userId_status_createdAt_idx" ON "UserSubscription"("userId", "status", "createdAt");
CREATE INDEX "UserSubscription_planId_status_idx" ON "UserSubscription"("planId", "status");
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SubscriptionOrder" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "planId" TEXT NOT NULL,
  "status" "SubscriptionOrderStatus" NOT NULL DEFAULT 'PENDING', "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'CNY',
  "paymentMethod" TEXT NOT NULL DEFAULT '', "externalOrderId" TEXT, "paidAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionOrder_externalOrderId_key" ON "SubscriptionOrder"("externalOrderId");
CREATE INDEX "SubscriptionOrder_userId_createdAt_idx" ON "SubscriptionOrder"("userId", "createdAt");
CREATE INDEX "SubscriptionOrder_status_createdAt_idx" ON "SubscriptionOrder"("status", "createdAt");
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
