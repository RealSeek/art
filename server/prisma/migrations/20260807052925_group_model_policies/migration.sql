-- Some existing development databases created UserGroup before this migration.
-- Fresh databases create it in 20260807143000, so defer this policy schema there.
DO $$
BEGIN
  IF to_regclass('"UserGroup"') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "UserGroup"
    ADD COLUMN "allowUserByok" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "creditRatePercent" INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN "restrictModels" BOOLEAN NOT NULL DEFAULT false;

  CREATE TABLE "UserGroupModelAccess" (
    "groupId" TEXT NOT NULL,
    "modelPresetId" TEXT NOT NULL,
    "flatCreditCostOverride" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserGroupModelAccess_pkey" PRIMARY KEY ("groupId", "modelPresetId")
  );

  CREATE INDEX "UserGroupModelAccess_modelPresetId_idx" ON "UserGroupModelAccess"("modelPresetId");
  ALTER TABLE "UserGroupModelAccess" ADD CONSTRAINT "UserGroupModelAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "UserGroupModelAccess" ADD CONSTRAINT "UserGroupModelAccess_modelPresetId_fkey" FOREIGN KEY ("modelPresetId") REFERENCES "ModelPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END $$;
