ALTER TABLE "ModelProviderRoute" ADD COLUMN "options" JSONB;

UPDATE "ModelProviderRoute"
SET "options" = '{"videoCapabilities":{"resolutions":["480p","720p"],"durations":[5,10],"aspectRatios":["16:9","9:16","1:1"]}}'::jsonb
WHERE "id" = 'cmsou2on4001avg4o7kabeuqc';
