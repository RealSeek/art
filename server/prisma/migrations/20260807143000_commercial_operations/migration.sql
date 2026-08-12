CREATE TABLE "UserGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#2563eb',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserGroup_name_key" ON "UserGroup"("name");

CREATE TABLE "UserGroupMember" (
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserGroupMember_pkey" PRIMARY KEY ("groupId", "userId")
);

CREATE INDEX "UserGroupMember_userId_idx" ON "UserGroupMember"("userId");

CREATE TABLE "AnnouncementCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "targetGroupId" TEXT,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnnouncementCampaign_createdAt_idx" ON "AnnouncementCampaign"("createdAt");

ALTER TABLE "RedemptionCode" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RedemptionCode" ADD COLUMN "codePrefix" TEXT NOT NULL DEFAULT '';

ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGroupMember" ADD CONSTRAINT "UserGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementCampaign" ADD CONSTRAINT "AnnouncementCampaign_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "UserGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
