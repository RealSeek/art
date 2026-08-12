CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '通用',
    "variables" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PromptTemplate_enabled_category_sortOrder_idx" ON "PromptTemplate"("enabled", "category", "sortOrder");
