-- MiniMax H3 视频模型的能力对齐上游文档：
-- 分辨率由模型名绑定、时长 5–15 秒、最多 9 张参考图与 3 段参考音频（JSON + base64 Data URL）。
WITH h3 AS (
  SELECT
    um."id",
    COALESCE(lower((regexp_match(COALESCE(r."upstreamModel", um."key"), 'minimaxh3-(2k|[0-9]{3,4}p)'))[1]), '720p') AS resolution
  FROM "UserModel" AS um
  LEFT JOIN LATERAL (
    SELECT "upstreamModel" FROM "UserModelRoute" WHERE "userModelId" = um."id" LIMIT 1
  ) AS r ON true
  WHERE um."capability" = 'VIDEO'
    AND COALESCE(r."upstreamModel", um."key") ~* 'minimaxh3'
)
UPDATE "UserModel" AS um
SET "options" = jsonb_set(
  COALESCE(um."options", '{}'::jsonb),
  '{videoCapabilities}',
  COALESCE(um."options" -> 'videoCapabilities', '{}'::jsonb) || jsonb_build_object(
    'resolutions', jsonb_build_array(h3.resolution),
    'defaultResolution', h3.resolution,
    'durations', '[5, 10, 15]'::jsonb,
    'aspectRatios', '["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]'::jsonb,
    'minDuration', 5,
    'maxDuration', 15,
    'maxReferences', 9,
    'maxAudioReferences', 3,
    'referenceMode', 'DATA_URL_JSON',
    'resolutionLocked', true
  ),
  true
)
FROM h3
WHERE um."id" = h3."id";
