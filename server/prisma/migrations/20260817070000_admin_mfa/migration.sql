ALTER TABLE "User" ADD COLUMN "adminMfaSecretEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "adminMfaEnabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "adminMfaRecoveryHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
