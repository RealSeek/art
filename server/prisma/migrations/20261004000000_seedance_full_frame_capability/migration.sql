-- 满血 Seedance 2.0 / 2.5 支持首帧、尾帧和首尾帧组合。
-- 特价 [c] 模型不在本次更新范围内，保留其已有渠道限制。
DO $$
DECLARE
  capabilities jsonb := '{"maxFirstLastFrames":2}'::jsonb;
BEGIN
  UPDATE "UserModel" AS model
  SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}',
        COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || capabilities),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE model.capability = 'VIDEO'
    AND EXISTS (SELECT 1 FROM "UserModelRoute" AS route
      WHERE route."userModelId" = model.id
        AND trim(route."upstreamModel") !~* '^\\[c\\]'
        AND trim(route."upstreamModel") ~* 'seedance[-_[:space:]]*2[._-][05]([^0-9]|$)');

  UPDATE "ModelPreset" AS model
  SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}',
        COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || capabilities),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE model.capability = 'VIDEO'
    AND trim(model."upstreamModel") !~* '^\\[c\\]'
    AND trim(model."upstreamModel") ~* 'seedance[-_[:space:]]*2[._-][05]([^0-9]|$)';

  UPDATE "ModelProviderRoute" AS route
  SET options = jsonb_set(COALESCE(route.options, '{}'::jsonb), '{videoCapabilities}',
        COALESCE(route.options->'videoCapabilities', '{}'::jsonb) || capabilities),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM "ModelPreset" AS model
  WHERE route."modelPresetId" = model.id AND model.capability = 'VIDEO'
    AND trim(COALESCE(NULLIF(route."upstreamModelOverride", ''), model."upstreamModel")) !~* '^\\[c\\]'
    AND trim(COALESCE(NULLIF(route."upstreamModelOverride", ''), model."upstreamModel"))
      ~* 'seedance[-_[:space:]]*2[._-][05]([^0-9]|$)';
END $$;
