ALTER TABLE "GenerationJob"
ADD COLUMN "lockedBy" TEXT,
ADD COLUMN "heartbeatAt" TIMESTAMP(3),
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "GenerationJob_status_leaseExpiresAt_idx" ON "GenerationJob"("status", "leaseExpiresAt");
