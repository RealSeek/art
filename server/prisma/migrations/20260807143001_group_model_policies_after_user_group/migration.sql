ALTER TABLE "UserGroup"
  ADD COLUMN IF NOT EXISTS "allowUserByok" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "creditRatePercent" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "restrictModels" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "UserGroupModelAccess" (
  "groupId" TEXT NOT NULL,
  "modelPresetId" TEXT NOT NULL,
  "flatCreditCostOverride" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserGroupModelAccess_pkey" PRIMARY KEY ("groupId", "modelPresetId")
);

CREATE INDEX IF NOT EXISTS "UserGroupModelAccess_modelPresetId_idx" ON "UserGroupModelAccess"("modelPresetId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserGroupModelAccess_groupId_fkey') THEN
    ALTER TABLE "UserGroupModelAccess" ADD CONSTRAINT "UserGroupModelAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserGroupModelAccess_modelPresetId_fkey') THEN
    ALTER TABLE "UserGroupModelAccess" ADD CONSTRAINT "UserGroupModelAccess_modelPresetId_fkey" FOREIGN KEY ("modelPresetId") REFERENCES "ModelPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
