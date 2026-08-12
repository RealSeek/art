UPDATE "ModelProviderRoute" AS route
SET "options" = jsonb_set(
  COALESCE(route."options", '{}'::jsonb),
  '{videoCapabilities}',
  '{"resolutions":["480p","720p"],"durations":[5,10],"aspectRatios":["16:9","9:16","1:1"]}'::jsonb,
  true
)
FROM "ModelPreset" AS model
WHERE model."id" = route."modelPresetId"
  AND model."capability" = 'VIDEO'
  AND LOWER(COALESCE(route."upstreamModelOverride", model."upstreamModel")) = 'grok-imagine-video';
