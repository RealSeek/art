ALTER TABLE "SystemSetting" ALTER COLUMN "linuxDoScopes" SET DEFAULT 'user';
UPDATE "SystemSetting" SET "linuxDoScopes" = 'user' WHERE "linuxDoScopes" = 'user:profile';
