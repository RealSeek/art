ALTER TABLE "Asset" ADD COLUMN "storageDriver" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "Asset" ADD COLUMN "storageBucket" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Asset_storageDriver_createdAt_idx" ON "Asset"("storageDriver", "createdAt");
