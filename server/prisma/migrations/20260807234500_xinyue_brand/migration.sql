ALTER TABLE "SystemSetting"
  ALTER COLUMN "siteName" SET DEFAULT 'Xinyue AI',
  ALTER COLUMN "smtpFromName" SET DEFAULT 'Xinyue AI';

UPDATE "SystemSetting"
SET
  "siteName" = CASE WHEN "siteName" = 'Flux Studio' THEN 'Xinyue AI' ELSE "siteName" END,
  "smtpFromName" = CASE WHEN "smtpFromName" = 'Flux Studio' THEN 'Xinyue AI' ELSE "smtpFromName" END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "siteName" = 'Flux Studio' OR "smtpFromName" = 'Flux Studio';
