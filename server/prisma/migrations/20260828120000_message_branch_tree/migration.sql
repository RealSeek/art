ALTER TABLE "Conversation" ADD COLUMN "activeLeafId" TEXT;
ALTER TABLE "Message" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Message" ADD COLUMN "branchIndex" INTEGER NOT NULL DEFAULT 0;

-- Existing conversations were linear. Preserve that history as a single
-- parent chain before new branch-aware writes start using activeLeafId.
WITH ordered AS (
  SELECT "id", "conversationId",
    LAG("id") OVER (PARTITION BY "conversationId" ORDER BY "createdAt", "id") AS "previousId"
  FROM "Message"
  WHERE "deletedAt" IS NULL
)
UPDATE "Message" AS message
SET "parentId" = ordered."previousId"
FROM ordered
WHERE message."id" = ordered."id";

UPDATE "Conversation" AS conversation
SET "activeLeafId" = latest."id"
FROM (
  SELECT DISTINCT ON ("conversationId") "conversationId", "id"
  FROM "Message"
  WHERE "deletedAt" IS NULL
  ORDER BY "conversationId", "createdAt" DESC, "id" DESC
) AS latest
WHERE conversation."id" = latest."conversationId";

CREATE INDEX "Message_conversationId_parentId_branchIndex_idx" ON "Message"("conversationId", "parentId", "branchIndex");
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
