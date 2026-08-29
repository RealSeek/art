-- Remove the legacy first-party promotional navigation preset while leaving
-- administrator-created external links untouched.
DELETE FROM "ExternalNavLink"
WHERE "key" = 'xinyue_api' OR "id" = 'xinyue_external_api';
