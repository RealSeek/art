-- Preserve channel limits and pricing while retiring the old reference protocol.
UPDATE "UserModel" AS model
SET options = jsonb_set(model.options, '{videoCapabilities}',
      ((model.options->'videoCapabilities') - 'providerProtocol') ||
      '{"referenceMode":"CONTENT_JSON","requestFormat":"seedance"}'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE model.capability = 'VIDEO'
  AND model.options->'videoCapabilities'->>'referenceMode' = 'REFERENCES_JSON'
  AND EXISTS (SELECT 1 FROM "UserModelRoute" AS route
    WHERE route."userModelId" = model.id
      AND route."upstreamModel" ~* 'seedance[-_[:space:]]*2[._-][05]([^0-9]|$)');

UPDATE "ModelPreset" AS model
SET options = jsonb_set(model.options, '{videoCapabilities}',
      ((model.options->'videoCapabilities') - 'providerProtocol') ||
      '{"referenceMode":"CONTENT_JSON","requestFormat":"seedance"}'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE model.capability = 'VIDEO'
  AND model.options->'videoCapabilities'->>'referenceMode' = 'REFERENCES_JSON'
  AND model."upstreamModel" ~* 'seedance[-_[:space:]]*2[._-][05]([^0-9]|$)';

UPDATE "ModelProviderRoute" AS route
SET options = jsonb_set(route.options, '{videoCapabilities}',
      ((route.options->'videoCapabilities') - 'providerProtocol') ||
      '{"referenceMode":"CONTENT_JSON","requestFormat":"seedance"}'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "ModelPreset" AS model
WHERE route."modelPresetId" = model.id AND model.capability = 'VIDEO'
  AND route.options->'videoCapabilities'->>'referenceMode' = 'REFERENCES_JSON'
  AND COALESCE(NULLIF(route."upstreamModelOverride", ''), model."upstreamModel")
    ~* 'seedance[-_[:space:]]*2[._-][05]([^0-9]|$)';
