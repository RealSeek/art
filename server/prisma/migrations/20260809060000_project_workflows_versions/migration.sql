ALTER TABLE "Project"
  ADD COLUMN "workflowStatus" TEXT NOT NULL DEFAULT 'PLANNING',
  ADD COLUMN "workflowConfig" JSONB,
  ADD COLUMN "defaultModel" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "defaultAssistantId" TEXT,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "Project_defaultAssistantId_idx" ON "Project"("defaultAssistantId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultAssistantId_fkey" FOREIGN KEY ("defaultAssistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProjectVersion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "changeSummary" TEXT NOT NULL DEFAULT '',
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectVersion_projectId_version_key" UNIQUE ("projectId", "version")
);
CREATE INDEX "ProjectVersion_projectId_createdAt_idx" ON "ProjectVersion"("projectId", "createdAt");

INSERT INTO "ProjectVersion" ("id", "projectId", "version", "label", "changeSummary", "snapshot")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id"),
  p."id",
  p."revision",
  '初始版本',
  '迁移前项目快照',
  jsonb_build_object(
    'name', p."name",
    'description', p."description",
    'instructions', p."instructions",
    'workflowStatus', p."workflowStatus",
    'workflowConfig', COALESCE(p."workflowConfig", jsonb_build_object('steps', '[]'::jsonb, 'defaultPrompt', '', 'outputRequirements', '')),
    'defaultModel', p."defaultModel",
    'defaultAssistantId', p."defaultAssistantId",
    'revision', p."revision"
  )
FROM "Project" p
WHERE NOT EXISTS (SELECT 1 FROM "ProjectVersion" v WHERE v."projectId" = p."id");
