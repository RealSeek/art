CREATE TABLE "CanvasDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FREEFORM',
    "document" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CanvasDocument_userId_archivedAt_updatedAt_idx" ON "CanvasDocument"("userId", "archivedAt", "updatedAt");
CREATE INDEX "CanvasDocument_projectId_updatedAt_idx" ON "CanvasDocument"("projectId", "updatedAt");

ALTER TABLE "CanvasDocument" ADD CONSTRAINT "CanvasDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasDocument" ADD CONSTRAINT "CanvasDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
