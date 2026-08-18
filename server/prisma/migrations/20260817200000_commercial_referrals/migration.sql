CREATE TYPE "ReferralStatus" AS ENUM ('REGISTERED', 'COOLING', 'REVIEW_REQUIRED', 'APPROVED', 'REWARDED', 'REJECTED', 'REVERSED');

ALTER TABLE "SystemSetting" ADD COLUMN "referralEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSetting" ADD COLUMN "referralCoolingDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "SystemSetting" ADD COLUMN "referralMinimumPaidCents" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "SystemSetting" ADD COLUMN "referralMonthlyRewardLimit" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "SystemSetting" ADD COLUMN "referralAutoApprove" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ReferralCode" ("id", "userId", "code", "enabled", "createdAt", "updatedAt")
SELECT 'ref_' || md5("inviterId" || ':' || "code"), "inviterId", "code", true, "createdAt", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("inviterId") "inviterId", "code", "createdAt"
  FROM "Invitation"
  ORDER BY "inviterId", ("inviteeId" IS NULL) DESC, "createdAt" ASC
) AS existing_codes;

DELETE FROM "Invitation" WHERE "inviteeId" IS NULL;
DROP INDEX "Invitation_code_key";
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_inviteeId_fkey";
ALTER TABLE "Invitation" ALTER COLUMN "inviteeId" SET NOT NULL;
ALTER TABLE "Invitation" ADD COLUMN "status" "ReferralStatus" NOT NULL DEFAULT 'REGISTERED';
ALTER TABLE "Invitation" ADD COLUMN "qualifyingTransactionId" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "qualifiedAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invitation" ADD COLUMN "payableAt" TIMESTAMP(3);
ALTER TABLE "Invitation" ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "Invitation" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Invitation" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "reviewReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invitation" ADD COLUMN "riskFlags" JSONB;
ALTER TABLE "Invitation" ADD COLUMN "registrationIpHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invitation" ADD COLUMN "registrationAgentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invitation" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "ReferralCode_userId_key" ON "ReferralCode"("userId");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE INDEX "ReferralCode_enabled_createdAt_idx" ON "ReferralCode"("enabled", "createdAt");
CREATE UNIQUE INDEX "Invitation_qualifyingTransactionId_key" ON "Invitation"("qualifyingTransactionId");
CREATE INDEX "Invitation_inviterId_status_createdAt_idx" ON "Invitation"("inviterId", "status", "createdAt");
CREATE INDEX "Invitation_status_payableAt_idx" ON "Invitation"("status", "payableAt");
CREATE INDEX "Invitation_code_createdAt_idx" ON "Invitation"("code", "createdAt");

ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_qualifyingTransactionId_fkey" FOREIGN KEY ("qualifyingTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
