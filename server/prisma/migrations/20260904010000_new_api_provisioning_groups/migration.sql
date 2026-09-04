ALTER TABLE "SystemSetting" ADD COLUMN "newApiProvisioningGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "UserApiCredential" ADD COLUMN "provisionKey" TEXT;
ALTER TABLE "UserApiCredential" ADD COLUMN "externalTokenId" TEXT;

CREATE UNIQUE INDEX "UserApiCredential_userId_provisionKey_key" ON "UserApiCredential"("userId", "provisionKey");
