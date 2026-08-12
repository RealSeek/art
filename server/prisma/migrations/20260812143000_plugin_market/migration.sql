CREATE TYPE "PluginVisibility" AS ENUM ('OFFICIAL', 'PRIVATE');
CREATE TYPE "PluginStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');
CREATE TYPE "PluginCapability" AS ENUM ('CHAT', 'IMAGE', 'VIDEO', 'COMMERCE', 'OFFICE');

CREATE TABLE "PluginCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "icon" TEXT NOT NULL DEFAULT 'blocks',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PluginCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Plugin" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "instruction" TEXT NOT NULL,
  "icon" TEXT NOT NULL DEFAULT 'blocks',
  "version" TEXT NOT NULL DEFAULT '1.0.0',
  "capabilities" "PluginCapability"[] DEFAULT ARRAY[]::"PluginCapability"[],
  "recommendedModel" TEXT NOT NULL DEFAULT '',
  "outputRequirements" TEXT NOT NULL DEFAULT '',
  "config" JSONB,
  "visibility" "PluginVisibility" NOT NULL DEFAULT 'PRIVATE',
  "status" "PluginStatus" NOT NULL DEFAULT 'DRAFT',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "priceCredits" INTEGER NOT NULL DEFAULT 0,
  "installCount" INTEGER NOT NULL DEFAULT 0,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Plugin_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Plugin_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PluginCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PluginInstallation" (
  "userId" TEXT NOT NULL,
  "pluginId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "paidCredits" INTEGER NOT NULL DEFAULT 0,
  "settings" JSONB,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PluginInstallation_pkey" PRIMARY KEY ("userId", "pluginId"),
  CONSTRAINT "PluginInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PluginInstallation_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PluginUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pluginId" TEXT NOT NULL,
  "jobId" TEXT,
  "capability" "PluginCapability" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PluginUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PluginUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PluginUsage_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PluginCategory_slug_key" ON "PluginCategory"("slug");
CREATE INDEX "PluginCategory_enabled_sortOrder_idx" ON "PluginCategory"("enabled", "sortOrder");
CREATE UNIQUE INDEX "Plugin_slug_key" ON "Plugin"("slug");
CREATE INDEX "Plugin_visibility_status_featured_sortOrder_idx" ON "Plugin"("visibility", "status", "featured", "sortOrder");
CREATE INDEX "Plugin_ownerId_updatedAt_idx" ON "Plugin"("ownerId", "updatedAt");
CREATE INDEX "Plugin_categoryId_status_idx" ON "Plugin"("categoryId", "status");
CREATE INDEX "PluginInstallation_pluginId_enabled_idx" ON "PluginInstallation"("pluginId", "enabled");
CREATE UNIQUE INDEX "PluginUsage_jobId_key" ON "PluginUsage"("jobId");
CREATE INDEX "PluginUsage_pluginId_createdAt_idx" ON "PluginUsage"("pluginId", "createdAt");
CREATE INDEX "PluginUsage_userId_createdAt_idx" ON "PluginUsage"("userId", "createdAt");
CREATE INDEX "PluginUsage_status_createdAt_idx" ON "PluginUsage"("status", "createdAt");

INSERT INTO "PluginCategory" ("id", "name", "slug", "description", "icon", "sortOrder", "enabled", "updatedAt") VALUES
  ('plugin_category_productivity', '效率办公', 'productivity', '写作、分析、文档与日常办公', 'briefcase-business', 10, true, CURRENT_TIMESTAMP),
  ('plugin_category_creative', '创意设计', 'creative', '图片、视频与视觉创意', 'palette', 20, true, CURRENT_TIMESTAMP),
  ('plugin_category_commerce', '电商营销', 'commerce', '商品视觉、营销文案与经营分析', 'shopping-bag', 30, true, CURRENT_TIMESTAMP),
  ('plugin_category_development', '开发工具', 'development', '代码、架构与技术协作', 'code-2', 40, true, CURRENT_TIMESTAMP);

INSERT INTO "Plugin" ("id", "categoryId", "name", "slug", "description", "instruction", "icon", "version", "capabilities", "recommendedModel", "outputRequirements", "visibility", "status", "featured", "priceCredits", "sortOrder", "updatedAt") VALUES
  ('plugin_official_deep_writer', 'plugin_category_productivity', '深度写作', 'deep-writer', '面向报告、文章和商业材料的结构化写作插件。', '先识别受众、目的、语气与交付格式。信息不足时明确合理假设；输出内容必须结构完整、语言自然、可直接使用，避免空泛套话。', 'pen-line', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '使用清晰标题和可执行结论；引用未知事实时明确标注待核验。', 'OFFICIAL', 'PUBLISHED', true, 0, 10, CURRENT_TIMESTAMP),
  ('plugin_official_visual_director', 'plugin_category_creative', '视觉导演', 'visual-director', '把简短想法扩展为可控的图片与视频镜头语言。', '将用户意图转化为专业视觉方案，补充主体、环境、构图、镜头、光线、材质、色彩与情绪，但不得改变用户明确指定的核心内容。', 'aperture', '1.0.0', ARRAY['IMAGE','VIDEO']::"PluginCapability"[], '', '提示词应具体、连贯，不堆砌互相冲突的风格词。', 'OFFICIAL', 'PUBLISHED', true, 0, 20, CURRENT_TIMESTAMP),
  ('plugin_official_commerce_studio', 'plugin_category_commerce', '电商视觉策划', 'commerce-studio', '生成统一品牌感的商品视觉与营销素材方案。', '围绕商品卖点、目标人群和使用场景规划素材。保持商品主体和品牌信息准确，输出要适配电商平台并突出购买决策信息。', 'shopping-bag', '1.0.0', ARRAY['COMMERCE','IMAGE','CHAT']::"PluginCapability"[], '', '禁止虚构认证、功效、价格或促销承诺。', 'OFFICIAL', 'PUBLISHED', true, 0, 30, CURRENT_TIMESTAMP);
