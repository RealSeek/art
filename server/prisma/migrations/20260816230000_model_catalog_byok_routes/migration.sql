ALTER TABLE "ProviderChannel" ADD COLUMN "templateId" TEXT;
ALTER TABLE "ModelPreset" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "UserApiCredential"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "lastHealthStatus" TEXT,
  ADD COLUMN "lastHealthMessage" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastHealthAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
  ADD COLUMN "lastFailureAt" TIMESTAMP(3),
  ADD COLUMN "cooldownUntil" TIMESTAMP(3);

CREATE TABLE "ModelVendor" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT '',
  "websiteUrl" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelVendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderTemplate" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "vendorId" TEXT,
  "type" "ProviderType" NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "authType" "ProviderAuthType" NOT NULL DEFAULT 'BEARER',
  "apiProtocol" TEXT NOT NULL DEFAULT 'openai',
  "customHeaders" JSONB,
  "supportsDiscovery" BOOLEAN NOT NULL DEFAULT true,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserModel" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "vendorId" TEXT,
  "key" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "capability" "ModelCapability" NOT NULL,
  "apiProtocol" TEXT NOT NULL DEFAULT 'openai',
  "routingStrategy" TEXT NOT NULL DEFAULT 'PRIORITY',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserModelRoute" (
  "id" TEXT NOT NULL,
  "userModelId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "upstreamModel" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "weight" INTEGER NOT NULL DEFAULT 100,
  "lastHealthStatus" TEXT,
  "lastHealthMessage" TEXT NOT NULL DEFAULT '',
  "lastHealthAt" TIMESTAMP(3),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "cooldownUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserModelRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelVendor_key_key" ON "ModelVendor"("key");
CREATE INDEX "ModelVendor_enabled_sortOrder_idx" ON "ModelVendor"("enabled", "sortOrder");
CREATE UNIQUE INDEX "ProviderTemplate_key_key" ON "ProviderTemplate"("key");
CREATE INDEX "ProviderTemplate_enabled_sortOrder_idx" ON "ProviderTemplate"("enabled", "sortOrder");
CREATE INDEX "ProviderTemplate_vendorId_idx" ON "ProviderTemplate"("vendorId");
CREATE INDEX "ProviderChannel_templateId_idx" ON "ProviderChannel"("templateId");
CREATE INDEX "ModelPreset_vendorId_idx" ON "ModelPreset"("vendorId");
CREATE INDEX "UserApiCredential_templateId_idx" ON "UserApiCredential"("templateId");
CREATE UNIQUE INDEX "UserModel_userId_key_key" ON "UserModel"("userId", "key");
CREATE INDEX "UserModel_userId_capability_enabled_idx" ON "UserModel"("userId", "capability", "enabled");
CREATE INDEX "UserModel_vendorId_idx" ON "UserModel"("vendorId");
CREATE UNIQUE INDEX "UserModelRoute_userModelId_credentialId_upstreamModel_key" ON "UserModelRoute"("userModelId", "credentialId", "upstreamModel");
CREATE INDEX "UserModelRoute_userModelId_enabled_idx" ON "UserModelRoute"("userModelId", "enabled");
CREATE INDEX "UserModelRoute_credentialId_enabled_idx" ON "UserModelRoute"("credentialId", "enabled");

ALTER TABLE "ProviderTemplate" ADD CONSTRAINT "ProviderTemplate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ModelVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderChannel" ADD CONSTRAINT "ProviderChannel_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProviderTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelPreset" ADD CONSTRAINT "ModelPreset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ModelVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserApiCredential" ADD CONSTRAINT "UserApiCredential_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProviderTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserModel" ADD CONSTRAINT "UserModel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserModel" ADD CONSTRAINT "UserModel_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ModelVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserModelRoute" ADD CONSTRAINT "UserModelRoute_userModelId_fkey" FOREIGN KEY ("userModelId") REFERENCES "UserModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserModelRoute" ADD CONSTRAINT "UserModelRoute_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "UserApiCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
