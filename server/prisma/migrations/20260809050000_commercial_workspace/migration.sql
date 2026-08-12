CREATE TABLE "Assistant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "systemPrompt" TEXT NOT NULL DEFAULT '',
  "defaultModel" TEXT NOT NULL DEFAULT '',
  "templateIds" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Assistant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Assistant_enabled_visibility_sortOrder_idx" ON "Assistant"("enabled", "visibility", "sortOrder");

CREATE TABLE "KnowledgeBase" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'READY',
  "creatorId" TEXT NOT NULL,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "documentCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeBase_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "KnowledgeBase_creatorId_updatedAt_idx" ON "KnowledgeBase"("creatorId", "updatedAt");

CREATE TABLE "KnowledgeBaseAsset" (
  "knowledgeBaseId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "extractedText" TEXT NOT NULL DEFAULT '',
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeBaseAsset_pkey" PRIMARY KEY ("knowledgeBaseId", "assetId"),
  CONSTRAINT "KnowledgeBaseAsset_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeBaseAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "KnowledgeBaseAsset_assetId_idx" ON "KnowledgeBaseAsset"("assetId");

CREATE TABLE "AssistantKnowledgeBase" (
  "assistantId" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  CONSTRAINT "AssistantKnowledgeBase_pkey" PRIMARY KEY ("assistantId", "knowledgeBaseId"),
  CONSTRAINT "AssistantKnowledgeBase_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssistantKnowledgeBase_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ToolDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "endpoint" TEXT NOT NULL DEFAULT '',
  "scopes" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ToolDefinition_key_key" UNIQUE ("key")
);

CREATE TABLE "AssistantTool" (
  "assistantId" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  CONSTRAINT "AssistantTool_pkey" PRIMARY KEY ("assistantId", "toolId"),
  CONSTRAINT "AssistantTool_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssistantTool_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Team_slug_key" UNIQUE ("slug"),
  CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Team_ownerId_updatedAt_idx" ON "Team"("ownerId", "updatedAt");

CREATE TABLE "TeamMember" (
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId", "userId"),
  CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

CREATE TABLE "ToolCallAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "assistantId" TEXT,
  "status" TEXT NOT NULL,
  "input" JSONB,
  "output" JSONB,
  "error" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolCallAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ToolCallAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ToolCallAudit_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ToolCallAudit_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ToolCallAudit_userId_createdAt_idx" ON "ToolCallAudit"("userId", "createdAt");
CREATE INDEX "ToolCallAudit_toolId_createdAt_idx" ON "ToolCallAudit"("toolId", "createdAt");
