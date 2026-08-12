INSERT INTO "Inspiration" ("id", "mode", "title", "prompt", "badge", "coverUrl", "model", "options", "sortOrder", "enabled", "createdAt", "updatedAt")
VALUES
  ('default-video-cinematic-city', 'VIDEO', '电影感城市追逐', '夜晚霓虹城市中的高速追逐镜头，低机位跟拍，雨水反射灯光，电影级光影与运动模糊。', '电影感', '/assets/inspiration-1.jpg', 'Sora 2', '{"resolution":"1080p","duration":10,"aspectRatio":"16:9"}'::jsonb, 10, true, NOW(), NOW()),
  ('default-video-product-motion', 'VIDEO', '产品动态广告', '极简摄影棚中产品缓慢旋转，柔和轮廓光扫过材质表面，镜头平稳推进，精致商业广告质感。', '商业广告', '/assets/inspiration-4.jpg', 'Sora 2', '{"resolution":"1080p","duration":5,"aspectRatio":"16:9"}'::jsonb, 20, true, NOW(), NOW()),
  ('default-video-dream-architecture', 'VIDEO', '梦境建筑运镜', '镜头穿过宁静的超现实建筑空间，人物沿阶梯缓慢行走，晨雾和柔光营造梦境氛围。', '运镜', '/assets/inspiration-2.jpg', 'Sora 2', '{"resolution":"720p","duration":10,"aspectRatio":"16:9"}'::jsonb, 30, true, NOW(), NOW()),
  ('default-video-editorial-portrait', 'VIDEO', '时尚人像短片', '编辑风格人像短片，模特自然转身看向镜头，服装随风摆动，浅景深与柔和胶片颗粒。', '人像', '/assets/inspiration-3.jpg', 'Sora 2', '{"resolution":"1080p","duration":5,"aspectRatio":"9:16"}'::jsonb, 40, true, NOW(), NOW()),
  ('default-video-food-commercial', 'VIDEO', '夏日饮品特写', '冰爽水果饮品的微距商业镜头，冰块和水珠缓慢滑落，明亮自然光，镜头环绕产品移动。', '产品特写', '/assets/inspiration-4.jpg', 'Sora 2', '{"resolution":"720p","duration":5,"aspectRatio":"1:1"}'::jsonb, 50, true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
