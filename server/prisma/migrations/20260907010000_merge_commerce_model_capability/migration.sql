-- Commerce remains a generation job kind, but it now uses the IMAGE model catalog.
-- Remove the unused built-in duplicate only when it was never connected to a provider.
DELETE FROM "ModelPreset"
WHERE "key" = 'commerce-gpt-image-2'
  AND "providerId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ModelProviderRoute"
    WHERE "ModelProviderRoute"."modelPresetId" = "ModelPreset"."id"
  );

-- Preserve configured commerce models while avoiding a second IMAGE default.
UPDATE "ModelPreset" AS commerce
SET "isDefault" = false
WHERE commerce."capability" = 'COMMERCE'
  AND EXISTS (
    SELECT 1 FROM "ModelPreset" AS image
    WHERE image."capability" = 'IMAGE' AND image."isDefault" = true
  );

UPDATE "UserModel" AS commerce
SET "isDefault" = false
WHERE commerce."capability" = 'COMMERCE'
  AND EXISTS (
    SELECT 1 FROM "UserModel" AS image
    WHERE image."userId" = commerce."userId"
      AND image."capability" = 'IMAGE'
      AND image."isDefault" = true
  );

UPDATE "ModelPreset" SET "capability" = 'IMAGE' WHERE "capability" = 'COMMERCE';
UPDATE "UserModel" SET "capability" = 'IMAGE' WHERE "capability" = 'COMMERCE';

ALTER TYPE "ModelCapability" RENAME TO "ModelCapability_old";
CREATE TYPE "ModelCapability" AS ENUM ('CHAT', 'IMAGE', 'VIDEO');
ALTER TABLE "ModelPreset"
  ALTER COLUMN "capability" TYPE "ModelCapability"
  USING ("capability"::text::"ModelCapability");
ALTER TABLE "UserModel"
  ALTER COLUMN "capability" TYPE "ModelCapability"
  USING ("capability"::text::"ModelCapability");
DROP TYPE "ModelCapability_old";
