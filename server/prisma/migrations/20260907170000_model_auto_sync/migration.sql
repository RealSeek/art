ALTER TABLE "ProviderChannel" ADD COLUMN "autoSyncModels" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProviderChannel" ADD COLUMN "lastModelSyncAt" TIMESTAMP(3);

ALTER TABLE "UserApiCredential" ADD COLUMN "autoSyncModels" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserApiCredential" ADD COLUMN "lastModelSyncAt" TIMESTAMP(3);
ALTER TABLE "UserApiCredential" ADD COLUMN "suppressedModels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "SystemSetting" ADD COLUMN "modelAutoSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSetting" ADD COLUMN "modelAutoSyncIntervalHours" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "SystemSetting" ADD COLUMN "channelModelAutoSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSetting" ADD COLUMN "channelModelAutoSyncIntervalHours" INTEGER NOT NULL DEFAULT 6;
