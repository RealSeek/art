ALTER TABLE "SystemSetting" ADD COLUMN "mediaRetentionDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Asset" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "retentionExempt" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Asset" AS a
SET "retentionExempt" = true,
    "expiresAt" = NULL
WHERE (a."metadata"->>'purpose') IN (
  'chat-home-banner',
  'tool-icon',
  'inspiration-cover',
  'inspiration-preview-video',
  'inspiration-preview-image'
)
OR EXISTS (
  SELECT 1 FROM "Inspiration" AS i
  WHERE i."coverAssetId" = a."id"
     OR i."options"->>'previewVideoAssetId' = a."id"
     OR COALESCE(i."options"->'previewAssetIds', '[]'::jsonb) ? a."id"
)
OR EXISTS (
  SELECT 1 FROM "ToolDefinition" AS t
  WHERE t."iconAssetId" = a."id"
)
OR EXISTS (
  SELECT 1 FROM "PublishedWorkAsset" AS p
  WHERE p."assetId" = a."id"
);

UPDATE "Asset"
SET "expiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "retentionExempt" = false
  AND "deletedAt" IS NULL
  AND "kind" IN ('IMAGE', 'VIDEO', 'PRODUCT_PACK');

CREATE INDEX "Asset_expiresAt_deletedAt_idx" ON "Asset"("expiresAt", "deletedAt");
