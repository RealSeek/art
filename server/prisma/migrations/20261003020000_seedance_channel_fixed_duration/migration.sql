-- This channel alias only accepts 30-second videos; preserve unrelated capabilities and pricing.
DO $$
DECLARE
  pattern text := '^\[c\]seedance[-_[:space:]]?2[._-]5$';
  capabilities jsonb := '{"durations":[30],"defaultDuration":30,"minDuration":30,"maxDuration":30,"supportsAutoDuration":false}'::jsonb;
BEGIN
  UPDATE "UserModel" AS model
  SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}',
        COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || capabilities),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE model.capability = 'VIDEO'
    AND EXISTS (SELECT 1 FROM "UserModelRoute" AS route
      WHERE route."userModelId" = model.id AND trim(route."upstreamModel") ~* pattern);

  UPDATE "ModelPreset" AS model
  SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}',
        COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || capabilities),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE model.capability = 'VIDEO' AND trim(model."upstreamModel") ~* pattern;

  UPDATE "ModelProviderRoute" AS route
  SET options = jsonb_set(COALESCE(route.options, '{}'::jsonb), '{videoCapabilities}',
        COALESCE(route.options->'videoCapabilities', '{}'::jsonb) || capabilities),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM "ModelPreset" AS model
  WHERE route."modelPresetId" = model.id AND model.capability = 'VIDEO'
    AND trim(COALESCE(NULLIF(route."upstreamModelOverride", ''), model."upstreamModel")) ~* pattern;
END $$;
