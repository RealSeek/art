CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "providerRefundId" TEXT,
    "failureReason" TEXT NOT NULL DEFAULT '',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentRefund_transactionId_createdAt_idx" ON "PaymentRefund"("transactionId", "createdAt");
CREATE INDEX "PaymentRefund_userId_createdAt_idx" ON "PaymentRefund"("userId", "createdAt");
CREATE INDEX "PaymentRefund_status_createdAt_idx" ON "PaymentRefund"("status", "createdAt");

ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
