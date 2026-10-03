-- The gateway aliases and variants are distinct from native MiniMax-H3 (768p).
CREATE TEMP TABLE minimax_gateway_tiers AS
SELECT lower(prefix || 'MiniMaxH3' || suffix) AS model_name,
       jsonb_build_object(
         'resolutions', resolutions,
         'defaultResolution', resolution,
         'resolutionLocked', suffix <> '',
         'durations', '[5,10,15]'::jsonb,
         'minDuration', 5,
         'maxDuration', 15,
         'requestFormat', NULL,
         'referenceMode', 'CONTENT_JSON',
         'requiresPublicReferenceUrls', false
       ) AS capabilities
FROM (VALUES (''), ('[c]')) AS prefixes(prefix)
CROSS JOIN (VALUES
  ('', '720p', '["480p","720p","2k","2k-pro"]'::jsonb),
  ('-480p', '480p', '["480p"]'::jsonb),
  ('-720p', '720p', '["720p"]'::jsonb),
  ('-2k', '2k', '["2k"]'::jsonb),
  ('-2k-pro', '2k-pro', '["2k-pro"]'::jsonb)
) AS tiers(suffix, resolution, resolutions);

UPDATE "UserModel" AS model
SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}',
      COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || tiers.capabilities),
    "updatedAt" = CURRENT_TIMESTAMP
FROM minimax_gateway_tiers AS tiers
WHERE model.capability = 'VIDEO'
  AND EXISTS (SELECT 1 FROM "UserModelRoute" AS route
    WHERE route."userModelId" = model.id AND lower(route."upstreamModel") = tiers.model_name);

UPDATE "ModelPreset" AS model
SET options = jsonb_set(COALESCE(model.options, '{}'::jsonb), '{videoCapabilities}',
      COALESCE(model.options->'videoCapabilities', '{}'::jsonb) || tiers.capabilities),
    "updatedAt" = CURRENT_TIMESTAMP
FROM minimax_gateway_tiers AS tiers
WHERE model.capability = 'VIDEO' AND lower(model."upstreamModel") = tiers.model_name;

UPDATE "ModelProviderRoute" AS route
SET options = jsonb_set(route.options, '{videoCapabilities}',
      (route.options->'videoCapabilities') || tiers.capabilities),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "ModelPreset" AS model, minimax_gateway_tiers AS tiers
WHERE route."modelPresetId" = model.id AND model.capability = 'VIDEO'
  AND lower(COALESCE(NULLIF(route."upstreamModelOverride", ''), model."upstreamModel")) = tiers.model_name
  AND route.options->'videoCapabilities' IS NOT NULL;

DROP TABLE minimax_gateway_tiers;
