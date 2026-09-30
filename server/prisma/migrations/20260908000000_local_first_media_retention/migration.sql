-- 本地优先：平台生成的媒体默认只在服务器保留 1 天（浏览器本地副本为主）。
-- 1) 默认值改为 1 天；2) 现有部署的 30 天改为 1 天；
-- 3) 按新保留期重算现有媒体到期时间（今天生成的文件仍能保留约一天，方便下载）。
ALTER TABLE "SystemSetting" ALTER COLUMN "mediaRetentionDays" SET DEFAULT 1;

UPDATE "SystemSetting" SET "mediaRetentionDays" = 1 WHERE "mediaRetentionDays" = 30;

UPDATE "Asset"
SET "expiresAt" = "createdAt" + INTERVAL '1 day'
WHERE "retentionExempt" = false
  AND "deletedAt" IS NULL
  AND "kind" IN ('IMAGE', 'VIDEO', 'PRODUCT_PACK');
