CREATE TABLE "PromptLibrarySourceConfig" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromptLibrarySourceConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptLibrarySourceConfig_enabled_sortOrder_idx" ON "PromptLibrarySourceConfig"("enabled", "sortOrder");

CREATE TABLE "PromptLibraryItemOverride" (
  "itemId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT,
  "prompt" TEXT,
  "description" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromptLibraryItemOverride_pkey" PRIMARY KEY ("itemId")
);

CREATE INDEX "PromptLibraryItemOverride_sourceId_enabled_idx" ON "PromptLibraryItemOverride"("sourceId", "enabled");

INSERT INTO "PromptLibrarySourceConfig" ("id", "displayName", "enabled", "sortOrder", "updatedAt") VALUES
  ('upma-gpt-image-2', 'GPT Image 2 精选一', true, 10, CURRENT_TIMESTAMP),
  ('youmind-gpt-image-2', 'GPT Image 2 精选二', true, 20, CURRENT_TIMESTAMP),
  ('youmind-nano-banana-pro', 'Nano Banana Pro 精选', true, 30, CURRENT_TIMESTAMP),
  ('banana-prompt-quicker', '通用图片提示词', true, 40, CURRENT_TIMESTAMP),
  ('davidwu-gpt-image2-prompts', 'GPT Image 2 创意库', true, 50, CURRENT_TIMESTAMP),
  ('awesome-gpt-image', 'GPT Image 精选', true, 60, CURRENT_TIMESTAMP),
  ('awesome-gpt4o-image-prompts', 'GPT-4o 图片提示词', true, 70, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
