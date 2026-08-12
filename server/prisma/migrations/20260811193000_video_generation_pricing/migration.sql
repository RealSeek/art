-- Extend generation capabilities with video support.
ALTER TYPE "AssetKind" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "JobKind" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "ModelCapability" ADD VALUE IF NOT EXISTS 'VIDEO';

ALTER TABLE "ModelPreset" ADD COLUMN "videoCostMicros" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ModelProviderRoute" ADD COLUMN "videoCostMicros" INTEGER;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "videoAccess" BOOLEAN NOT NULL DEFAULT false;
