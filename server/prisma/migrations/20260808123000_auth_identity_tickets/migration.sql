CREATE TABLE "ExternalIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT,
  "avatarUrl" TEXT,
  "profile" JSONB,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthTicket" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT '',
  "subject" TEXT NOT NULL DEFAULT '',
  "email" TEXT,
  "profile" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_provider_subject_key" ON "ExternalIdentity"("provider", "subject");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
CREATE INDEX "ExternalIdentity_provider_email_idx" ON "ExternalIdentity"("provider", "email");
CREATE UNIQUE INDEX "AuthTicket_tokenHash_key" ON "AuthTicket"("tokenHash");
CREATE INDEX "AuthTicket_kind_expiresAt_idx" ON "AuthTicket"("kind", "expiresAt");
CREATE INDEX "AuthTicket_provider_subject_idx" ON "AuthTicket"("provider", "subject");

ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
