CREATE TYPE "TokenQuotaReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED');

CREATE TABLE "TokenQuotaReservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quotaId" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "reservedUnits" BIGINT NOT NULL,
  "chargedUnits" BIGINT NOT NULL DEFAULT 0,
  "status" "TokenQuotaReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "metadata" JSONB,
  "settledAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TokenQuotaReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TokenQuotaReservation_reservedUnits_nonnegative" CHECK ("reservedUnits" >= 0),
  CONSTRAINT "TokenQuotaReservation_chargedUnits_nonnegative" CHECK ("chargedUnits" >= 0),
  CONSTRAINT "TokenQuotaReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TokenQuotaReservation_quotaId_fkey" FOREIGN KEY ("quotaId") REFERENCES "UserTokenQuota"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TokenQuotaReservation_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TokenQuotaReservation_generationId_quotaId_key" ON "TokenQuotaReservation"("generationId", "quotaId");
CREATE INDEX "TokenQuotaReservation_userId_status_createdAt_idx" ON "TokenQuotaReservation"("userId", "status", "createdAt");
CREATE INDEX "TokenQuotaReservation_quotaId_status_createdAt_idx" ON "TokenQuotaReservation"("quotaId", "status", "createdAt");
CREATE INDEX "TokenQuotaReservation_generationId_status_idx" ON "TokenQuotaReservation"("generationId", "status");

-- Preserve outstanding and historical V1 reservations so queued jobs created
-- before this migration can still settle or release only their own hold.
INSERT INTO "TokenQuotaReservation" (
  "id", "userId", "quotaId", "generationId", "reservedUnits", "chargedUnits",
  "status", "metadata", "settledAt", "releasedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy:' || reserve_event."id",
  reserve_event."userId",
  reserve_event."quotaId",
  reserve_event."generationId",
  ABS(reserve_event."units"),
  COALESCE(ABS(charge_event."units"), 0),
  CASE
    WHEN charge_event."id" IS NOT NULL THEN 'SETTLED'::"TokenQuotaReservationStatus"
    WHEN release_event."id" IS NOT NULL THEN 'RELEASED'::"TokenQuotaReservationStatus"
    ELSE 'RESERVED'::"TokenQuotaReservationStatus"
  END,
  reserve_event."metadata",
  charge_event."createdAt",
  CASE WHEN charge_event."id" IS NULL THEN release_event."createdAt" ELSE NULL END,
  reserve_event."createdAt",
  COALESCE(charge_event."createdAt", release_event."createdAt", reserve_event."createdAt")
FROM "TokenQuotaEvent" reserve_event
LEFT JOIN LATERAL (
  SELECT event.*
  FROM "TokenQuotaEvent" event
  WHERE event."generationId" = reserve_event."generationId"
    AND event."quotaId" = reserve_event."quotaId"
    AND event."type" = 'CHARGE'
  ORDER BY event."createdAt" DESC, event."id" DESC
  LIMIT 1
) charge_event ON TRUE
LEFT JOIN LATERAL (
  SELECT event.*
  FROM "TokenQuotaEvent" event
  WHERE event."generationId" = reserve_event."generationId"
    AND event."quotaId" = reserve_event."quotaId"
    AND event."type" = 'RELEASE'
  ORDER BY event."createdAt" DESC, event."id" DESC
  LIMIT 1
) release_event ON TRUE
WHERE reserve_event."type" = 'RESERVE'
  AND reserve_event."generationId" IS NOT NULL
ON CONFLICT ("generationId", "quotaId") DO NOTHING;
