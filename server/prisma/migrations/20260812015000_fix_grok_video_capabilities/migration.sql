UPDATE "ModelPreset"
SET
  "options" = jsonb_set(
    COALESCE("options", '{}'::jsonb),
    '{videoCapabilities}',
    '{"resolutions":["480p","720p"],"durations":[5,10],"aspectRatios":["16:9","9:16","1:1"],"defaultResolution":"720p","defaultDuration":5,"defaultAspectRatio":"16:9","pricing":{"480p:5":5,"480p:10":10,"720p:5":10,"720p:10":20},"createPath":"/videos","statusPath":"/videos/{id}","contentPath":"/videos/{id}/content","pollIntervalMs":3000,"maxPollSeconds":600}'::jsonb,
    true
  ),
  "updatedAt" = NOW()
WHERE "key" = 'sora-2';

UPDATE "Inspiration"
SET
  "options" = jsonb_set(COALESCE("options", '{}'::jsonb), '{resolution}', '"720p"'::jsonb, true),
  "updatedAt" = NOW()
WHERE "mode" = 'VIDEO';
