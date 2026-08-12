CREATE TABLE "ContentPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '关于我们',
    "summary" TEXT NOT NULL DEFAULT '',
    "contentHtml" TEXT NOT NULL,
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentPage_slug_key" ON "ContentPage"("slug");
CREATE INDEX "ContentPage_published_sortOrder_updatedAt_idx" ON "ContentPage"("published", "sortOrder", "updatedAt");
CREATE INDEX "ContentPage_category_published_idx" ON "ContentPage"("category", "published");

INSERT INTO "ContentPage" ("id", "slug", "title", "category", "summary", "contentHtml", "published", "sortOrder", "publishedAt", "updatedAt")
VALUES (
  'about-xinyue',
  'about-xinyue-ai',
  '关于 Xinyue AI',
  '关于我们',
  'Xinyue AI 产品定位、平台能力与企业服务说明。',
  '<h2>让 AI 创作更简单</h2><p>Xinyue AI 面向个人创作者和企业团队，提供对话、图片生成、提示词管理和工作流协作能力。</p><h2>我们的方向</h2><p>通过统一的模型渠道、清晰的额度体系和可审计的运营后台，让每一次 AI 使用都稳定、透明、可管理。</p><h2>企业服务</h2><p>平台支持用户分组、模型定价、订阅套餐、支付渠道、内容审核、客服工单和操作审计，方便团队按自己的业务规则运营。</p>',
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
