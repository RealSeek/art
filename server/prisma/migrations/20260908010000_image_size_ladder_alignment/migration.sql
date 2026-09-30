-- 图片输出尺寸表对齐上游文档：按比例给出 1K/2K/4K 常用尺寸（单图上限约 829 万像素）。
-- 旧的多档列表含 4096x4096（16.7M 像素）会被上游拒绝，这里替换为文档尺寸表。
WITH sizes AS (
  SELECT '["1024x1024", "1280x720", "720x1280", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048", "2016x1344", "1344x2016", "2880x2880", "3840x2160", "2160x3840", "3520x2352", "2352x3520"]'::jsonb AS value
)
UPDATE "UserModel" AS um
SET "options" = jsonb_set("options"::jsonb, '{imageCapabilities,sizes}', sizes.value, true)
FROM sizes
WHERE um."capability" = 'IMAGE'
  AND um."options" -> 'imageCapabilities' -> 'sizes' = '["1024x1024", "1536x1024", "1024x1536", "2048x2048", "4096x4096"]'::jsonb;

WITH sizes AS (
  SELECT '["1024x1024", "1280x720", "720x1280", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048", "2016x1344", "1344x2016", "2880x2880", "3840x2160", "2160x3840", "3520x2352", "2352x3520"]'::jsonb AS value
)
UPDATE "ModelPreset" AS mp
SET "options" = jsonb_set("options"::jsonb, '{imageCapabilities,sizes}', sizes.value, true)
FROM sizes
WHERE mp."capability" = 'IMAGE'
  AND mp."options" -> 'imageCapabilities' -> 'sizes' = '["1024x1024", "1536x1024", "1024x1536", "2048x2048", "4096x4096"]'::jsonb;
