CREATE TYPE "ModerationAppealStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ModerationAppeal" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "ModerationAppealStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "reviewNote" TEXT NOT NULL DEFAULT '',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationAppealHistory" (
  "id" TEXT NOT NULL,
  "appealId" TEXT NOT NULL,
  "actorId" TEXT,
  "status" "ModerationAppealStatus" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationAppealHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModerationAppeal_eventId_key" ON "ModerationAppeal"("eventId");
CREATE INDEX "ModerationAppeal_status_createdAt_idx" ON "ModerationAppeal"("status", "createdAt");
CREATE INDEX "ModerationAppeal_userId_createdAt_idx" ON "ModerationAppeal"("userId", "createdAt");
CREATE INDEX "ModerationAppealHistory_appealId_createdAt_idx" ON "ModerationAppealHistory"("appealId", "createdAt");

ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ModerationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationAppealHistory" ADD CONSTRAINT "ModerationAppealHistory_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "ModerationAppeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppealHistory" ADD CONSTRAINT "ModerationAppealHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
