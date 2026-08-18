-- Extend moderation coverage to user-published works.
ALTER TYPE "ModerationSource" ADD VALUE IF NOT EXISTS 'WORK';

CREATE TYPE "WorkLifecycleStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');
CREATE TYPE "WorkVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');
CREATE TYPE "WorkModerationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'TAKEN_DOWN');
CREATE TYPE "WorkAuthorDisplay" AS ENUM ('PROFILE', 'CUSTOM', 'HIDDEN');
CREATE TYPE "WorkAssetRole" AS ENUM ('COVER', 'CONTENT');
CREATE TYPE "WorkReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

CREATE TABLE "PublishedWork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'ASSET',
    "sourceId" TEXT,
    "lifecycleStatus" "WorkLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentVersionId" TEXT,
    "publishedVersionId" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublishedWork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishedWorkVersion" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "WorkVisibility" NOT NULL DEFAULT 'PRIVATE',
    "authorDisplay" "WorkAuthorDisplay" NOT NULL DEFAULT 'PROFILE',
    "customAuthor" TEXT NOT NULL DEFAULT '',
    "publicPrompt" TEXT NOT NULL DEFAULT '',
    "moderationStatus" "WorkModerationStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PublishedWorkVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishedWorkAsset" (
    "versionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" "WorkAssetRole" NOT NULL DEFAULT 'CONTENT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "PublishedWorkAsset_pkey" PRIMARY KEY ("versionId", "assetId")
);

CREATE TABLE "WorkLike" (
    "workId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkLike_pkey" PRIMARY KEY ("workId", "userId")
);

CREATE TABLE "UserFollow" (
    "followerId" TEXT NOT NULL,
    "followedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("followerId", "followedId")
);

CREATE TABLE "WorkReport" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status" "WorkReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT NOT NULL DEFAULT '',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublishedWork_slug_key" ON "PublishedWork"("slug");
CREATE UNIQUE INDEX "PublishedWork_currentVersionId_key" ON "PublishedWork"("currentVersionId");
CREATE UNIQUE INDEX "PublishedWork_publishedVersionId_key" ON "PublishedWork"("publishedVersionId");
CREATE INDEX "PublishedWork_userId_updatedAt_idx" ON "PublishedWork"("userId", "updatedAt");
CREATE INDEX "PublishedWork_lifecycleStatus_isFeatured_featuredAt_idx" ON "PublishedWork"("lifecycleStatus", "isFeatured", "featuredAt");
CREATE INDEX "PublishedWork_lifecycleStatus_viewCount_updatedAt_idx" ON "PublishedWork"("lifecycleStatus", "viewCount", "updatedAt");
CREATE UNIQUE INDEX "PublishedWorkVersion_workId_versionNumber_key" ON "PublishedWorkVersion"("workId", "versionNumber");
CREATE INDEX "PublishedWorkVersion_moderationStatus_submittedAt_idx" ON "PublishedWorkVersion"("moderationStatus", "submittedAt");
CREATE INDEX "PublishedWorkVersion_visibility_reviewedAt_idx" ON "PublishedWorkVersion"("visibility", "reviewedAt");
CREATE INDEX "PublishedWorkVersion_category_reviewedAt_idx" ON "PublishedWorkVersion"("category", "reviewedAt");
CREATE INDEX "PublishedWorkVersion_tags_idx" ON "PublishedWorkVersion" USING GIN ("tags");
CREATE INDEX "PublishedWorkAsset_assetId_idx" ON "PublishedWorkAsset"("assetId");
CREATE INDEX "WorkLike_userId_createdAt_idx" ON "WorkLike"("userId", "createdAt");
CREATE INDEX "UserFollow_followedId_createdAt_idx" ON "UserFollow"("followedId", "createdAt");
CREATE INDEX "WorkReport_status_createdAt_idx" ON "WorkReport"("status", "createdAt");
CREATE INDEX "WorkReport_workId_reporterId_idx" ON "WorkReport"("workId", "reporterId");

ALTER TABLE "PublishedWork" ADD CONSTRAINT "PublishedWork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishedWorkVersion" ADD CONSTRAINT "PublishedWorkVersion_workId_fkey" FOREIGN KEY ("workId") REFERENCES "PublishedWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishedWorkVersion" ADD CONSTRAINT "PublishedWorkVersion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishedWork" ADD CONSTRAINT "PublishedWork_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PublishedWorkVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishedWork" ADD CONSTRAINT "PublishedWork_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "PublishedWorkVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishedWorkAsset" ADD CONSTRAINT "PublishedWorkAsset_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PublishedWorkVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishedWorkAsset" ADD CONSTRAINT "PublishedWorkAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkLike" ADD CONSTRAINT "WorkLike_workId_fkey" FOREIGN KEY ("workId") REFERENCES "PublishedWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkLike" ADD CONSTRAINT "WorkLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_workId_fkey" FOREIGN KEY ("workId") REFERENCES "PublishedWork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
