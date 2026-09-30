-- 已导入的图片模型补齐多档输出尺寸与分档定价（1K/2K/4K）。
-- 只升级旧的单档默认值 ["1024x1024"]，不覆盖管理员或用户自定义过的尺寸清单。

UPDATE "UserModel" AS um
SET "options" = jsonb_set(
  COALESCE(um."options", '{}'::jsonb),
  '{imageCapabilities}',
  COALESCE(um."options" -> 'imageCapabilities', '{}'::jsonb) || jsonb_build_object(
    'sizes', '["1024x1024", "1536x1024", "1024x1536", "2048x2048", "4096x4096"]'::jsonb,
    'resolutionPricing', jsonb_build_object('1K', cost.value, '2K', cost.value * 2, '4K', cost.value * 4)
  ),
  true
)
FROM (
  SELECT
    um2."id",
    GREATEST(
      1,
      CASE
        WHEN jsonb_typeof(um2."options" -> 'imageCapabilities' -> 'resolutionPricing' -> '1K') = 'number'
          THEN (um2."options" -> 'imageCapabilities' -> 'resolutionPricing' ->> '1K')::int
        ELSE 1
      END
    ) AS value
  FROM "UserModel" AS um2
) AS cost
WHERE um."id" = cost."id"
  AND um."capability" = 'IMAGE'
  AND um."options" -> 'imageCapabilities' -> 'sizes' = '["1024x1024"]'::jsonb
  AND EXISTS (
    SELECT 1 FROM "UserModelRoute" AS r
    WHERE r."userModelId" = um."id"
      AND r."upstreamModel" ~* '(gpt-image|dall-?e|gemini|imagen|seedream|flux|qwen-image|nano-?banana|[-_]edit|inpaint)'
  );
