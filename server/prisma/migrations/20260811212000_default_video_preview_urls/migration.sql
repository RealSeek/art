UPDATE "Inspiration" AS inspiration
SET "options" = COALESCE(inspiration."options", '{}'::jsonb) || jsonb_build_object('previewVideoUrl', defaults.url)
FROM (VALUES
  ('default-video-cinematic-city', '/assets/video-demo-sintel.mp4'),
  ('default-video-product-motion', '/assets/video-demo-flower.mp4'),
  ('default-video-dream-architecture', '/assets/video-demo-bunny.mp4'),
  ('default-video-editorial-portrait', '/assets/video-demo-sintel.mp4'),
  ('default-video-food-commercial', '/assets/video-demo-flower.mp4'),
  ('default-video-nature-timelapse', '/assets/video-demo-flower.mp4'),
  ('default-video-scifi-particles', '/assets/video-demo-sintel.mp4'),
  ('default-video-miniature-world', '/assets/video-demo-bunny.mp4')
) AS defaults(id, url)
WHERE inspiration."id" = defaults.id
  AND inspiration."mode" = 'VIDEO'
  AND NOT (COALESCE(inspiration."options", '{}'::jsonb) ? 'previewVideoAssetId');
