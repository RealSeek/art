CREATE TYPE "CouponDiscountType" AS ENUM ('FIXED', 'PERCENT');
CREATE TYPE "UserCouponStatus" AS ENUM ('AVAILABLE', 'LOCKED', 'REDEEMED', 'EXPIRED', 'REVOKED');
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('REDEEMED', 'REFUNDED');

ALTER TABLE "SubscriptionOrder" ADD COLUMN "originalAmountCents" INTEGER;
ALTER TABLE "SubscriptionOrder" ADD COLUMN "promotionDiscountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionOrder" ADD COLUMN "couponDiscountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionOrder" ADD COLUMN "priceSnapshot" JSONB;
ALTER TABLE "SubscriptionOrder" ADD COLUMN "promotionId" TEXT;
ALTER TABLE "SubscriptionOrder" ADD COLUMN "userCouponId" TEXT;
UPDATE "SubscriptionOrder" SET "originalAmountCents" = "amountCents" WHERE "originalAmountCents" IS NULL;
ALTER TABLE "SubscriptionOrder" ALTER COLUMN "originalAmountCents" SET NOT NULL;

CREATE TABLE "PromotionCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromotionCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionPlan" (
  "campaignId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "promotionalPriceCents" INTEGER NOT NULL,
  CONSTRAINT "PromotionPlan_pkey" PRIMARY KEY ("campaignId", "planId")
);

CREATE TABLE "CouponTemplate" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "discountType" "CouponDiscountType" NOT NULL,
  "discountValue" INTEGER NOT NULL,
  "minimumSpendCents" INTEGER NOT NULL DEFAULT 0,
  "maximumDiscountCents" INTEGER,
  "stackWithPromotion" BOOLEAN NOT NULL DEFAULT true,
  "claimEnabled" BOOLEAN NOT NULL DEFAULT true,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "totalLimit" INTEGER,
  "perUserLimit" INTEGER NOT NULL DEFAULT 1,
  "validDays" INTEGER,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "issuedCount" INTEGER NOT NULL DEFAULT 0,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CouponTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CouponTemplatePlan" (
  "templateId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  CONSTRAINT "CouponTemplatePlan_pkey" PRIMARY KEY ("templateId", "planId")
);

CREATE TABLE "UserCoupon" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "status" "UserCouponStatus" NOT NULL DEFAULT 'AVAILABLE',
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "lockedOrderId" TEXT,
  "lockedAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserCoupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CouponRedemption" (
  "id" TEXT NOT NULL,
  "userCouponId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'REDEEMED',
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refundedAt" TIMESTAMP(3),
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromotionCampaign_enabled_startsAt_endsAt_idx" ON "PromotionCampaign"("enabled", "startsAt", "endsAt");
CREATE INDEX "PromotionPlan_planId_idx" ON "PromotionPlan"("planId");
CREATE UNIQUE INDEX "CouponTemplate_code_key" ON "CouponTemplate"("code");
CREATE INDEX "CouponTemplate_enabled_claimEnabled_startsAt_endsAt_idx" ON "CouponTemplate"("enabled", "claimEnabled", "startsAt", "endsAt");
CREATE INDEX "CouponTemplatePlan_planId_idx" ON "CouponTemplatePlan"("planId");
CREATE UNIQUE INDEX "UserCoupon_lockedOrderId_key" ON "UserCoupon"("lockedOrderId");
CREATE INDEX "UserCoupon_userId_status_expiresAt_idx" ON "UserCoupon"("userId", "status", "expiresAt");
CREATE INDEX "UserCoupon_templateId_userId_createdAt_idx" ON "UserCoupon"("templateId", "userId", "createdAt");
CREATE UNIQUE INDEX "CouponRedemption_userCouponId_key" ON "CouponRedemption"("userCouponId");
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");
CREATE INDEX "CouponRedemption_status_redeemedAt_idx" ON "CouponRedemption"("status", "redeemedAt");
CREATE INDEX "SubscriptionOrder_promotionId_createdAt_idx" ON "SubscriptionOrder"("promotionId", "createdAt");
CREATE INDEX "SubscriptionOrder_userCouponId_idx" ON "SubscriptionOrder"("userCouponId");

ALTER TABLE "PromotionPlan" ADD CONSTRAINT "PromotionPlan_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromotionCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionPlan" ADD CONSTRAINT "PromotionPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponTemplatePlan" ADD CONSTRAINT "CouponTemplatePlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CouponTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponTemplatePlan" ADD CONSTRAINT "CouponTemplatePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CouponTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "PromotionCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_userCouponId_fkey" FOREIGN KEY ("userCouponId") REFERENCES "UserCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userCouponId_fkey" FOREIGN KEY ("userCouponId") REFERENCES "UserCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SubscriptionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
