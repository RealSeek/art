UPDATE "Inspiration"
SET
  "title" = updates.title,
  "prompt" = updates.prompt,
  "badge" = updates.badge,
  "coverUrl" = updates.cover_url,
  "model" = 'Grok Imagine Video',
  "options" = COALESCE("Inspiration"."options", '{}'::jsonb) || updates.options,
  "updatedAt" = NOW()
FROM (VALUES
  (
    'default-video-cinematic-city',
    '都市穿梭长镜头',
    '黑白电影质感的地下交通枢纽，镜头沿扶梯缓慢向前推进，通勤人群形成富有节奏的流动层次，高反差光影，稳定器长镜头。',
    '电影感',
    '/assets/inspirations/video/urban-transit.jpg',
    '{"resolution":"1080p","duration":10,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/urban-transit.mp4"}'::jsonb
  ),
  (
    'default-video-product-motion',
    '手作材质微距',
    '俯拍手工陶艺制作过程，双手细致塑形，湿润陶土在转盘上形成流畅纹理，暖色环境光，真实触感与舒缓节奏。',
    '微距',
    '/assets/inspirations/video/artisan-pottery.jpg',
    '{"resolution":"1080p","duration":10,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/artisan-pottery.mp4"}'::jsonb
  ),
  (
    'default-video-dream-architecture',
    '史诗海岸叙事',
    '孤独人物站在巨大的海岸悬崖边缘，薄雾掠过岩壁与海面，镜头缓慢拉远揭示宏大尺度，低饱和电影调色，史诗感构图。',
    '叙事',
    '/assets/inspirations/video/epic-coast.jpg',
    '{"resolution":"1080p","duration":10,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/epic-coast.mp4"}'::jsonb
  ),
  (
    'default-video-editorial-portrait',
    '城市几何航拍',
    '垂直俯拍城市圆形广场与金色地标，车辆和行人沿几何道路有序移动，镜头缓慢旋转上升，对称构图与高级都市色彩。',
    '航拍',
    '/assets/inspirations/video/urban-geometry.jpg',
    '{"resolution":"1080p","duration":5,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/urban-geometry.mp4"}'::jsonb
  ),
  (
    'default-video-food-commercial',
    '高级料理广告',
    '餐厅后厨的精致摆盘特写，厨师将新鲜香草轻轻落在料理表面，浅景深追焦，柔和轮廓光，高级餐饮广告质感。',
    '商业',
    '/assets/inspirations/video/culinary-detail.jpg',
    '{"resolution":"1080p","duration":5,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/culinary-detail.mp4"}'::jsonb
  ),
  (
    'default-video-nature-timelapse',
    '山谷公路航拍',
    '无人机沿蜿蜒山路平稳俯冲飞行，深绿色山谷与道路形成强烈图形对比，晨雾与自然光影，电影级旅行航拍。',
    '自然',
    '/assets/inspirations/video/mountain-road.jpg',
    '{"resolution":"1080p","duration":10,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/mountain-road.mp4"}'::jsonb
  ),
  (
    'default-video-scifi-particles',
    '虹膜科幻微距',
    '超微距镜头贴近人眼虹膜，细密纹理与高光倒影逐渐显现，瞳孔轻微收缩，冷暖光线流动，未来生物科技视觉。',
    '科幻',
    '/assets/inspirations/video/sci-fi-iris.jpg',
    '{"resolution":"1080p","duration":5,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/sci-fi-iris.mp4"}'::jsonb
  ),
  (
    'default-video-miniature-world',
    '诡谲空间长镜头',
    '镜头缓慢穿过空无一人的绿色走廊，顶灯依次闪烁，消失点不断拉近，冷色电影光影与轻微手持呼吸感，营造超现实悬疑氛围。',
    '氛围',
    '/assets/inspirations/video/liminal-corridor.jpg',
    '{"resolution":"1080p","duration":10,"aspectRatio":"16:9","previewVideoUrl":"/assets/inspirations/video/liminal-corridor.mp4"}'::jsonb
  )
) AS updates(id, title, prompt, badge, cover_url, options)
WHERE "Inspiration"."id" = updates.id;
