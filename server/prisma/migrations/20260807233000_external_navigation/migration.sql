-- Administrator-managed links shown in the workspace sidebar.
CREATE TABLE "ExternalNavLink" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT 'code',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "openNewTab" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalNavLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalNavLink_key_key" ON "ExternalNavLink"("key");
CREATE INDEX "ExternalNavLink_enabled_sortOrder_idx" ON "ExternalNavLink"("enabled", "sortOrder");
