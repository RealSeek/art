CREATE TYPE "ModerationRuleType" AS ENUM ('KEYWORD', 'REGEX');
CREATE TYPE "ModerationAction" AS ENUM ('LOG', 'REVIEW', 'BLOCK');
CREATE TYPE "ModerationSource" AS ENUM ('CHAT', 'IMAGE', 'COMMERCE', 'FILE_NAME');
CREATE TYPE "ModerationEventStatus" AS ENUM ('OPEN', 'APPROVED', 'DISMISSED');

CREATE TABLE "ModerationPolicy" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "scanChat" BOOLEAN NOT NULL DEFAULT true,
  "scanImage" BOOLEAN NOT NULL DEFAULT true,
  "scanCommerce" BOOLEAN NOT NULL DEFAULT true,
  "failClosed" BOOLEAN NOT NULL DEFAULT true,
  "blockMessage" TEXT NOT NULL DEFAULT '内容未通过安全检查，请修改后重试。',
  "retainContent" BOOLEAN NOT NULL DEFAULT false,
  "excerptLength" INTEGER NOT NULL DEFAULT 240,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModerationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '自定义',
  "type" "ModerationRuleType" NOT NULL DEFAULT 'KEYWORD',
  "pattern" TEXT NOT NULL,
  "action" "ModerationAction" NOT NULL DEFAULT 'BLOCK',
  "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModerationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "source" "ModerationSource" NOT NULL,
  "action" "ModerationAction" NOT NULL,
  "status" "ModerationEventStatus" NOT NULL DEFAULT 'OPEN',
  "contentHash" TEXT NOT NULL,
  "contentExcerpt" TEXT NOT NULL DEFAULT '',
  "matchedRules" JSONB NOT NULL,
  "context" JSONB,
  "resolvedById" TEXT,
  "resolutionNote" TEXT NOT NULL DEFAULT '',
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationRule_enabled_sortOrder_idx" ON "ModerationRule"("enabled", "sortOrder");
CREATE INDEX "ModerationRule_category_idx" ON "ModerationRule"("category");
CREATE INDEX "ModerationEvent_status_createdAt_idx" ON "ModerationEvent"("status", "createdAt");
CREATE INDEX "ModerationEvent_userId_createdAt_idx" ON "ModerationEvent"("userId", "createdAt");
CREATE INDEX "ModerationEvent_source_action_createdAt_idx" ON "ModerationEvent"("source", "action", "createdAt");

ALTER TABLE "ModerationEvent" ADD CONSTRAINT "ModerationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ModerationPolicy" ("id", "updatedAt") VALUES ('global', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
