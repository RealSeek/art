CREATE INDEX "CreditLedger_referenceType_referenceId_idx"
ON "CreditLedger"("referenceType", "referenceId");

CREATE INDEX "TeamCreditLedger_referenceType_referenceId_idx"
ON "TeamCreditLedger"("referenceType", "referenceId");
