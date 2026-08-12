ALTER TABLE "Conversation"
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "shareToken" TEXT,
ADD COLUMN "sharedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Conversation_shareToken_key" ON "Conversation"("shareToken");
CREATE INDEX "Conversation_userId_pinnedAt_updatedAt_idx" ON "Conversation"("userId", "pinnedAt", "updatedAt");
