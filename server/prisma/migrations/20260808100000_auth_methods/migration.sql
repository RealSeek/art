ALTER TABLE "User" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "SystemSetting"
  ADD COLUMN "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "passwordRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "linuxDoLoginEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "linuxDoClientId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "encryptedLinuxDoClientSecret" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "linuxDoClientSecretHint" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "linuxDoRedirectUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "linuxDoScopes" TEXT NOT NULL DEFAULT 'user:profile',
  ADD COLUMN "linuxDoAuthorizeUrl" TEXT NOT NULL DEFAULT 'https://connect.linux.do/oauth2/authorize',
  ADD COLUMN "linuxDoTokenUrl" TEXT NOT NULL DEFAULT 'https://connect.linux.do/oauth2/token',
  ADD COLUMN "linuxDoUserInfoUrl" TEXT NOT NULL DEFAULT 'https://connect.linux.do/api/user',
  ADD COLUMN "sub2apiLoginEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sub2apiBaseUrl" TEXT NOT NULL DEFAULT '';
