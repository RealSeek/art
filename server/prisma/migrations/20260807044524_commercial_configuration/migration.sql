-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('OPENAI', 'NEW_API', 'SUB2API', 'OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "ProviderAuthType" AS ENUM ('BEARER', 'X_API_KEY', 'BOTH');

-- CreateEnum
CREATE TYPE "ModelCapability" AS ENUM ('CHAT', 'IMAGE', 'COMMERCE');

-- CreateEnum
CREATE TYPE "RechargeOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "providerChannelId" TEXT;

-- CreateTable
CREATE TABLE "ProviderChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL DEFAULT '',
    "apiKeyHint" TEXT NOT NULL DEFAULT '',
    "authType" "ProviderAuthType" NOT NULL DEFAULT 'BEARER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "allowUserKeys" BOOLEAN NOT NULL DEFAULT true,
    "customHeaders" JSONB,
    "metadata" JSONB,
    "lastHealthStatus" TEXT,
    "lastHealthMessage" TEXT,
    "lastHealthAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPreset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "providerId" TEXT,
    "upstreamModel" TEXT NOT NULL,
    "capability" "ModelCapability" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowUserKey" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "flatCreditCost" INTEGER NOT NULL DEFAULT 1,
    "inputCreditsPerMillion" INTEGER NOT NULL DEFAULT 0,
    "outputCreditsPerMillion" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT NOT NULL DEFAULT '',
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "apiKeyHint" TEXT NOT NULL,
    "authType" "ProviderAuthType" NOT NULL DEFAULT 'BEARER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "customHeaders" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "siteName" TEXT NOT NULL DEFAULT 'Flux Studio',
    "siteLogoUrl" TEXT NOT NULL DEFAULT '',
    "supportUrl" TEXT NOT NULL DEFAULT '',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailLoginEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedEmailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "otpTtlMinutes" INTEGER NOT NULL DEFAULT 10,
    "otpResendSeconds" INTEGER NOT NULL DEFAULT 60,
    "defaultUserCredits" INTEGER NOT NULL DEFAULT 8,
    "defaultTheme" TEXT NOT NULL DEFAULT 'dark',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
    "defaultChatModelKey" TEXT NOT NULL DEFAULT '',
    "defaultImageModelKey" TEXT NOT NULL DEFAULT '',
    "userByokEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inviteRewardCredits" INTEGER NOT NULL DEFAULT 0,
    "rechargeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minRechargeCents" INTEGER NOT NULL DEFAULT 100,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUsername" TEXT NOT NULL DEFAULT '',
    "encryptedSmtpPassword" TEXT NOT NULL DEFAULT '',
    "smtpPasswordHint" TEXT NOT NULL DEFAULT '',
    "smtpFromName" TEXT NOT NULL DEFAULT 'Flux Studio',
    "smtpFromEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RechargePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "credits" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "originalPriceCents" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RechargePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RechargeOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "status" "RechargeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "credits" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "externalOrderId" TEXT,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RechargeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderChannel_name_key" ON "ProviderChannel"("name");

-- CreateIndex
CREATE INDEX "ProviderChannel_enabled_priority_idx" ON "ProviderChannel"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPreset_key_key" ON "ModelPreset"("key");

-- CreateIndex
CREATE INDEX "ModelPreset_capability_enabled_sortOrder_idx" ON "ModelPreset"("capability", "enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "ModelPreset_providerId_idx" ON "ModelPreset"("providerId");

-- CreateIndex
CREATE INDEX "UserApiCredential_userId_enabled_idx" ON "UserApiCredential"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiCredential_userId_name_key" ON "UserApiCredential"("userId", "name");

-- CreateIndex
CREATE INDEX "RechargePackage_enabled_sortOrder_idx" ON "RechargePackage"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RechargeOrder_externalOrderId_key" ON "RechargeOrder"("externalOrderId");

-- CreateIndex
CREATE INDEX "RechargeOrder_userId_createdAt_idx" ON "RechargeOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RechargeOrder_status_createdAt_idx" ON "RechargeOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_providerChannelId_idx" ON "GenerationJob"("providerChannelId");

-- AddForeignKey
ALTER TABLE "ModelPreset" ADD CONSTRAINT "ModelPreset_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiCredential" ADD CONSTRAINT "UserApiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "RechargePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_providerChannelId_fkey" FOREIGN KEY ("providerChannelId") REFERENCES "ProviderChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
