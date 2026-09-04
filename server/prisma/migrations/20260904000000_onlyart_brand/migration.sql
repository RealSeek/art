ALTER TABLE "SystemSetting"
  ALTER COLUMN "siteName" SET DEFAULT 'OnlyArt',
  ALTER COLUMN "smtpFromName" SET DEFAULT 'OnlyArt';

UPDATE "SystemSetting"
SET
  "siteName" = CASE WHEN "siteName" = 'Xinyue AI' THEN 'OnlyArt' ELSE "siteName" END,
  "smtpFromName" = CASE WHEN "smtpFromName" = 'Xinyue AI' THEN 'OnlyArt' ELSE "smtpFromName" END
WHERE "siteName" = 'Xinyue AI' OR "smtpFromName" = 'Xinyue AI';
