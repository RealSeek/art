ALTER TABLE "Session" DROP COLUMN IF EXISTS "mfaVerifiedAt";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "adminMfaSecretEncrypted",
  DROP COLUMN IF EXISTS "adminMfaEnabledAt",
  DROP COLUMN IF EXISTS "adminMfaRecoveryHashes";
