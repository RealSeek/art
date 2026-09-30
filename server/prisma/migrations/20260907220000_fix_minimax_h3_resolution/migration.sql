-- 修正上一版迁移的大小写匹配问题：regexp_match 未使用大小写不敏感标志，
-- 导致 MiniMaxH3 变体的 resolutions/defaultResolution 都落回 720p。
WITH h3 AS (
  SELECT
    um."id",
    COALESCE(
      lower((regexp_match(COALESCE(r."upstreamModel", um."key"), '(?i)minimaxh3-(2k|[0-9]{3,4}p)'))[1]),
      '720p'
    ) AS resolution
  FROM "UserModel" AS um
  LEFT JOIN LATERAL (
    SELECT "upstreamModel" FROM "UserModelRoute" WHERE "userModelId" = um."id" LIMIT 1
  ) AS r ON true
  WHERE um."capability" = 'VIDEO'
    AND COALESCE(r."upstreamModel", um."key") ~* 'minimaxh3'
)
UPDATE "UserModel" AS um
SET "options" = jsonb_set(
  jsonb_set(
    COALESCE(um."options", '{}'::jsonb),
    '{videoCapabilities,resolutions}',
    jsonb_build_array(h3.resolution),
    true
  ),
  '{videoCapabilities,defaultResolution}',
  to_jsonb(h3.resolution),
  true
)
FROM h3
WHERE um."id" = h3."id"
  AND um."options" -> 'videoCapabilities' ->> 'defaultResolution' <> h3.resolution;
