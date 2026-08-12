UPDATE "GenerationJob"
SET
  "options" = jsonb_set(COALESCE("options", '{}'::jsonb), '{resolution}', '"720p"'::jsonb, true),
  "updatedAt" = NOW()
WHERE
  "kind" = 'VIDEO'
  AND COALESCE("options"->>'resolution', '') NOT IN ('480p', '720p');
