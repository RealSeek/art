INSERT INTO "Inspiration" ("id", "mode", "title", "prompt", "badge", "coverUrl", "model", "options", "sortOrder", "enabled", "createdAt", "updatedAt")
VALUES
  ('default-video-nature-timelapse', 'VIDEO', '自然风光延时', '云层掠过群山与湖面，日光从清晨逐渐变为金色黄昏，平稳延时摄影与细腻自然色彩。', '延时摄影', '/assets/inspiration-2.jpg', 'Sora 2', '{"resolution":"1080p","duration":10,"aspectRatio":"16:9"}'::jsonb, 60, true, NOW(), NOW()),
  ('default-video-scifi-particles', 'VIDEO', '科幻粒子转场', '发光粒子在黑色空间中汇聚成未来装置，镜头缓慢环绕，粒子消散形成流畅转场。', '视觉特效', '/assets/inspiration-3.jpg', 'Sora 2', '{"resolution":"1080p","duration":5,"aspectRatio":"16:9"}'::jsonb, 70, true, NOW(), NOW()),
  ('default-video-miniature-world', 'VIDEO', '微缩世界故事', '电影级微缩城市街道，微小人物穿行于暖色灯光之间，移轴镜头与精细景深营造童话氛围。', '微缩场景', '/assets/inspiration-1.jpg', 'Sora 2', '{"resolution":"720p","duration":10,"aspectRatio":"16:9"}'::jsonb, 80, true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
