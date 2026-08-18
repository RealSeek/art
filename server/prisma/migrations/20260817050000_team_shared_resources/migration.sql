ALTER TABLE "Project" ADD COLUMN "teamId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "teamId" TEXT;
ALTER TABLE "KnowledgeBase" ADD COLUMN "teamId" TEXT;

CREATE INDEX "Project_teamId_updatedAt_idx" ON "Project"("teamId", "updatedAt");
CREATE INDEX "Asset_teamId_createdAt_idx" ON "Asset"("teamId", "createdAt");
CREATE INDEX "KnowledgeBase_teamId_updatedAt_idx" ON "KnowledgeBase"("teamId", "updatedAt");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeBase"
  ADD CONSTRAINT "KnowledgeBase_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Asset" AS asset
SET "teamId" = project."teamId"
FROM "Project" AS project
WHERE asset."projectId" = project."id"
  AND project."teamId" IS NOT NULL;
