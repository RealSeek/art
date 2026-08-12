CREATE TABLE "PaymentChannel" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "supportedMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "minAmountCents" INTEGER NOT NULL DEFAULT 100,
  "maxAmountCents" INTEGER,
  "dailyLimitCents" INTEGER,
  "feeRateBps" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "publicConfig" JSONB,
  "encryptedSecrets" TEXT NOT NULL DEFAULT '',
  "secretHints" JSONB,
  "lastHealthStatus" TEXT NOT NULL DEFAULT 'unchecked',
  "lastError" TEXT NOT NULL DEFAULT '',
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "orderType" TEXT NOT NULL,
  "subscriptionOrderId" TEXT,
  "rechargeOrderId" TEXT,
  "outTradeNo" TEXT NOT NULL,
  "providerTradeNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "paymentMethod" TEXT NOT NULL,
  "checkoutUrl" TEXT NOT NULL DEFAULT '',
  "qrCodeUrl" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "transactionId" TEXT,
  "externalId" TEXT,
  "eventType" TEXT NOT NULL DEFAULT '',
  "signatureValid" BOOLEAN NOT NULL DEFAULT false,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "errorMessage" TEXT NOT NULL DEFAULT '',
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentTransaction_outTradeNo_key" ON "PaymentTransaction"("outTradeNo");
CREATE INDEX "PaymentChannel_enabled_sortOrder_idx" ON "PaymentChannel"("enabled", "sortOrder");
CREATE INDEX "PaymentChannel_providerKey_enabled_idx" ON "PaymentChannel"("providerKey", "enabled");
CREATE INDEX "PaymentTransaction_userId_createdAt_idx" ON "PaymentTransaction"("userId", "createdAt");
CREATE INDEX "PaymentTransaction_status_createdAt_idx" ON "PaymentTransaction"("status", "createdAt");
CREATE INDEX "PaymentTransaction_channelId_createdAt_idx" ON "PaymentTransaction"("channelId", "createdAt");
CREATE INDEX "PaymentTransaction_subscriptionOrderId_idx" ON "PaymentTransaction"("subscriptionOrderId");
CREATE INDEX "PaymentTransaction_rechargeOrderId_idx" ON "PaymentTransaction"("rechargeOrderId");
CREATE INDEX "PaymentWebhookEvent_channelId_createdAt_idx" ON "PaymentWebhookEvent"("channelId", "createdAt");
CREATE INDEX "PaymentWebhookEvent_transactionId_createdAt_idx" ON "PaymentWebhookEvent"("transactionId", "createdAt");
CREATE INDEX "PaymentWebhookEvent_externalId_idx" ON "PaymentWebhookEvent"("externalId");

ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
