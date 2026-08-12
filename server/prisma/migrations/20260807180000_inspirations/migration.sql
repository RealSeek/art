CREATE TYPE "InspirationMode" AS ENUM ('IMAGE', 'COMMERCE');

CREATE TABLE "Inspiration" (
  "id" TEXT NOT NULL,
  "mode" "InspirationMode" NOT NULL,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "badge" TEXT NOT NULL DEFAULT '',
  "coverUrl" TEXT NOT NULL DEFAULT '',
  "coverAssetId" TEXT,
  "model" TEXT,
  "options" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Inspiration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Inspiration_mode_enabled_sortOrder_idx" ON "Inspiration"("mode", "enabled", "sortOrder");
ALTER TABLE "Inspiration" ADD CONSTRAINT "Inspiration_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Inspiration" ("id", "mode", "title", "prompt", "badge", "coverUrl", "sortOrder", "updatedAt") VALUES
('inspiration-image-1', 'IMAGE', '未来感商业海报', '未来感商业广告海报，强烈主体构图，电影级灯光，精细产品质感，适合品牌社交媒体发布', '', '/assets/inspiration-1.jpg', 10, CURRENT_TIMESTAMP),
('inspiration-image-2', 'IMAGE', '宁静建筑风格海报', '极简宁静建筑空间，柔和自然光，低饱和配色，具有高级杂志排版留白', '', '/assets/inspiration-2.jpg', 20, CURRENT_TIMESTAMP),
('inspiration-image-3', 'IMAGE', '典藏纸币微距摄影', '典藏纸币微距摄影，细节锐利，博物馆级布光，深色背景，高端收藏品视觉', '', '/assets/inspiration-3.jpg', 30, CURRENT_TIMESTAMP),
('inspiration-image-4', 'IMAGE', '清爽夏日饮品海报', '夏日水果饮品广告，透明杯体，真实冰块与水珠，明亮自然光，清爽商业摄影', '', '/assets/inspiration-4.jpg', 40, CURRENT_TIMESTAMP),
('inspiration-image-5', 'IMAGE', '东方餐饮品牌海报', '东方餐饮品牌海报，食物主体突出，热气与质感真实，红黑金配色，商业广告摄影', '', '/assets/inspiration-1.jpg', 50, CURRENT_TIMESTAMP),
('inspiration-image-6', 'IMAGE', '轻奢甜品视觉', '轻奢甜品产品摄影，柔光，细腻奶油质感，干净背景，精品烘焙品牌视觉', '', '/assets/inspiration-2.jpg', 60, CURRENT_TIMESTAMP),
('inspiration-commerce-1', 'COMMERCE', '洗护产品素材包', '为洗护产品制作一套电商素材包，包含白底主图、质地特写、核心成分和使用场景', '素材包', '/assets/inspiration-2.jpg', 10, CURRENT_TIMESTAMP),
('inspiration-commerce-2', 'COMMERCE', '香氛商品详情页', '为香氛产品设计完整详情页，突出香调、瓶身工艺、使用场景和品牌故事', '详情页', '/assets/inspiration-4.jpg', 20, CURRENT_TIMESTAMP),
('inspiration-commerce-3', 'COMMERCE', '家居产品卖点页', '制作家居产品卖点详情页，清晰展示尺寸、材质、结构细节和空间搭配效果', '详情页', '/assets/inspiration-3.jpg', 30, CURRENT_TIMESTAMP),
('inspiration-commerce-4', 'COMMERCE', '新品上市素材包', '制作新品上市电商素材包，包含主视觉、核心卖点、规格和多平台广告尺寸', '素材包', '/assets/inspiration-1.jpg', 40, CURRENT_TIMESTAMP),
('inspiration-commerce-5', 'COMMERCE', '食品包装素材包', '制作食品包装电商素材包，突出原料、口感、营养信息和包装细节', '素材包', '/assets/inspiration-4.jpg', 50, CURRENT_TIMESTAMP);
