CREATE TABLE "CanvasDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "viewport" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CanvasDocument_userId_updatedAt_idx" ON "CanvasDocument"("userId", "updatedAt");

ALTER TABLE "CanvasDocument" ADD CONSTRAINT "CanvasDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
