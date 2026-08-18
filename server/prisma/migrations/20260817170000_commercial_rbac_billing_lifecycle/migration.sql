-- CreateEnum
CREATE TYPE "AccountDeletionStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('REQUESTED', 'REVIEWING', 'ISSUED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RenewalAttemptStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'PAYMENT_REQUIRED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRoleId" TEXT;

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "autoRenewEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "graceEndsAt" TIMESTAMP(3),
ADD COLUMN     "lastRenewalAttemptAt" TIMESTAMP(3),
ADD COLUMN     "nextRenewalAt" TIMESTAMP(3),
ADD COLUMN     "renewalChannelId" TEXT,
ADD COLUMN     "renewalFailureCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- Preserve existing administrator access while moving authorization to explicit roles.
INSERT INTO "AdminRole" ("id", "code", "name", "description", "permissions", "builtIn", "enabled", "createdAt", "updatedAt")
VALUES ('role_system_administrator', 'system_administrator', '系统管理员', '保留现有管理员的完整业务权限。', ARRAY['*']::TEXT[], true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "User"
SET "adminRoleId" = 'role_system_administrator'
WHERE "role" = 'ADMIN';

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AccountDeletionStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "processingAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT NOT NULL DEFAULT '',
    "retentionNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionRenewalAttempt" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" "RenewalAttemptStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "orderId" TEXT,
    "transactionId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "failureReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionRenewalAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileType" TEXT NOT NULL DEFAULT 'COMPANY',
    "title" TEXT NOT NULL,
    "taxId" TEXT NOT NULL DEFAULT '',
    "invoiceEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'REQUESTED',
    "profileSnapshot" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "invoiceType" TEXT NOT NULL DEFAULT 'ELECTRONIC_NORMAL',
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "invoiceUrl" TEXT NOT NULL DEFAULT '',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_code_key" ON "AdminRole"("code");

-- CreateIndex
CREATE INDEX "AdminRole_enabled_createdAt_idx" ON "AdminRole"("enabled", "createdAt");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_userId_status_createdAt_idx" ON "AccountDeletionRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_status_scheduledAt_idx" ON "AccountDeletionRequest"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionRenewalAttempt_idempotencyKey_key" ON "SubscriptionRenewalAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SubscriptionRenewalAttempt_subscriptionId_createdAt_idx" ON "SubscriptionRenewalAttempt"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionRenewalAttempt_status_scheduledAt_idx" ON "SubscriptionRenewalAttempt"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SubscriptionRenewalAttempt_status_nextRetryAt_idx" ON "SubscriptionRenewalAttempt"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfile_userId_key" ON "BillingProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRequest_transactionId_key" ON "InvoiceRequest"("transactionId");

-- CreateIndex
CREATE INDEX "InvoiceRequest_userId_createdAt_idx" ON "InvoiceRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceRequest_status_createdAt_idx" ON "InvoiceRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "User_adminRoleId_idx" ON "User"("adminRoleId");

-- CreateIndex
CREATE INDEX "UserSubscription_autoRenewEnabled_nextRenewalAt_idx" ON "UserSubscription"("autoRenewEnabled", "nextRenewalAt");

-- CreateIndex
CREATE INDEX "UserSubscription_renewalChannelId_idx" ON "UserSubscription"("renewalChannelId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_renewalChannelId_fkey" FOREIGN KEY ("renewalChannelId") REFERENCES "PaymentChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRenewalAttempt" ADD CONSTRAINT "SubscriptionRenewalAttempt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
