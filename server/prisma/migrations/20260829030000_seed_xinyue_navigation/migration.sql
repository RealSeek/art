-- Keep a single first-party API entry in the public navigation. Existing
-- administrator-created links are retained but disabled instead of deleted.
UPDATE "ExternalNavLink" SET "enabled" = false WHERE "key" <> 'xinyue_api';

INSERT INTO "ExternalNavLink" ("id", "key", "name", "description", "url", "icon", "enabled", "openNewTab", "sortOrder", "createdAt", "updatedAt")
VALUES ('xinyue_external_api', 'xinyue_api', '心悦 API', '由心悦AI提供的统一模型 API 服务', 'https://xinyue.mom', 'api', true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "url" = EXCLUDED."url",
  "icon" = EXCLUDED."icon",
  "enabled" = true,
  "openNewTab" = true,
  "sortOrder" = 0,
  "updatedAt" = CURRENT_TIMESTAMP;
