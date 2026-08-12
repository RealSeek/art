UPDATE "ModelPreset"
SET "options" = '{"videoCapabilities":{"resolutions":["720p","1080p"],"durations":[5,10],"aspectRatios":["16:9","9:16","1:1"],"defaultResolution":"720p","defaultDuration":5,"defaultAspectRatio":"16:9","pricing":{"720p:5":10,"720p:10":20,"1080p:5":20,"1080p:10":40},"createPath":"/videos","statusPath":"/videos/{id}","contentPath":"/videos/{id}/content","pollIntervalMs":3000,"maxPollSeconds":600}}'::jsonb
WHERE "key" = 'sora-2'
  AND "capability" = 'VIDEO'
  AND "options" IS NULL;
