ALTER TABLE "Team" ADD COLUMN "billingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TeamMember" ADD COLUMN "monthlyCreditLimit" INTEGER;
ALTER TABLE "TeamMember" ADD COLUMN "creditsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeamMember" ADD COLUMN "creditPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GenerationJob" ADD COLUMN "billingTeamId" TEXT;

CREATE TABLE "TeamCreditAccount" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamCreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamCreditLedger" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "userId" TEXT,
  "type" "LedgerType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "idempotencyKey" TEXT,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamCreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamCreditAccount_teamId_key" ON "TeamCreditAccount"("teamId");
CREATE UNIQUE INDEX "TeamCreditLedger_idempotencyKey_key" ON "TeamCreditLedger"("idempotencyKey");
CREATE INDEX "TeamCreditLedger_accountId_createdAt_idx" ON "TeamCreditLedger"("accountId", "createdAt");
CREATE INDEX "TeamCreditLedger_userId_createdAt_idx" ON "TeamCreditLedger"("userId", "createdAt");
CREATE INDEX "GenerationJob_billingTeamId_createdAt_idx" ON "GenerationJob"("billingTeamId", "createdAt");

ALTER TABLE "TeamCreditAccount" ADD CONSTRAINT "TeamCreditAccount_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamCreditLedger" ADD CONSTRAINT "TeamCreditLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TeamCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamCreditLedger" ADD CONSTRAINT "TeamCreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_billingTeamId_fkey" FOREIGN KEY ("billingTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TeamCreditAccount" ("id", "teamId", "balance", "version", "createdAt", "updatedAt")
SELECT 'team_credit_' || md5("id"), "id", 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Team";
