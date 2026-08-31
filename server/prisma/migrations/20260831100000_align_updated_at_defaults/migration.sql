-- Align database defaults with Prisma fields managed by @updatedAt.
ALTER TABLE "AgentRun" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "AgentTask" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "AgentTaskStep" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "AgentToolCall" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Assistant" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Invitation" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "KnowledgeBase" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Plugin" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PluginCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PluginInstallation" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PluginUsage" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Team" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ToolApprovalRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ToolDefinition" ALTER COLUMN "updatedAt" DROP DEFAULT;
