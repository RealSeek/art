-- 升级已接入的 Seedance 2.0 / 2.5，保留模型、密钥路由及售价。
DO $$
DECLARE
  version text;
  pattern text;
  capabilities jsonb;
BEGIN
  FOREACH version IN ARRAY ARRAY['0', '5'] LOOP
    pattern := 'seedance[-_[:space:]]*2[._-]' || version || '([^0-9]|$)';
    capabilities := jsonb_build_object(
      'resolutions', CASE WHEN version = '5' THEN '["480p","720p","1080p"]'::jsonb ELSE '["480p","720p","1080p","4k"]'::jsonb END,
      'durations', CASE WHEN version = '5' THEN '[4,5,10,15,20,30]'::jsonb ELSE '[4,5,10,15]'::jsonb END,
      'aspectRatios', '["16:9","4:3","1:1","3:4","9:16","21:9","adaptive"]'::jsonb,
      'defaultResolution', '720p', 'defaultDuration', 5, 'defaultAspectRatio', '16:9',
      'minDuration', 4, 'maxDuration', CASE WHEN version = '5' THEN 30 ELSE 15 END,
      'maxReferences', CASE WHEN version = '5' THEN 30 ELSE 9 END,
      'maxAudioReferences', CASE WHEN version = '5' THEN 10 ELSE 3 END,
      'maxVideoReferences', CASE WHEN version = '5' THEN 10 ELSE 3 END,
      'referenceMode', 'CONTENT_JSON', 'supportsAutoDuration', true,
      'audioRequiresVisualReference', version <> '5', 'supportsVideoEditing', version = '5',
      'createPath', '/videos', 'statusPath', '/videos/{id}', 'contentPath', '/videos/{id}/content',
      'pollIntervalMs', 5000, 'maxPollSeconds', 0
    );

    UPDATE "UserModel" AS model
    SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}', COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || capabilities),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE model.capability = 'VIDEO' AND model.options ? 'discovery'
      AND EXISTS (SELECT 1 FROM "UserModelRoute" AS route WHERE route."userModelId" = model.id AND route."upstreamModel" ~* pattern);

    UPDATE "ModelPreset" AS model
    SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}', COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || capabilities),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE model.capability = 'VIDEO' AND model."upstreamModel" ~* pattern;

    UPDATE "ModelProviderRoute" AS route
    SET options = jsonb_set(COALESCE(route.options, '{}'::jsonb), '{videoCapabilities}', COALESCE(route.options->'videoCapabilities', '{}'::jsonb) || capabilities),
        "updatedAt" = CURRENT_TIMESTAMP
    FROM "ModelPreset" AS model
    WHERE route."modelPresetId" = model.id AND model.capability = 'VIDEO'
      AND COALESCE(NULLIF(route."upstreamModelOverride", ''), model."upstreamModel") ~* pattern;
  END LOOP;
END $$;
