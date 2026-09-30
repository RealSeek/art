-- 自动导入时的新能力推导只作用于后续同步；这里把已导入的图片模型一次性补齐，
-- 让已部署实例无需等待下一次同步。只做 false -> true 的升级，不改动其它字段。

-- 1. 编辑家族（gpt-image / dall-e / *-edit / inpaint）：补齐参考图与蒙版能力。
UPDATE "UserModel" AS um
SET "options" = jsonb_set(
  COALESCE(um."options", '{}'::jsonb),
  '{imageCapabilities}',
  COALESCE(um."options" -> 'imageCapabilities', '{}'::jsonb)
    || '{"supportsReference": true, "supportsMask": true}'::jsonb,
  true
)
WHERE um."capability" = 'IMAGE'
  AND um."apiProtocol" <> 'gemini'
  AND COALESCE(um."options" -> 'imageCapabilities' ->> 'supportsMask', 'false') <> 'true'
  AND EXISTS (
    SELECT 1 FROM "UserModelRoute" AS r
    WHERE r."userModelId" = um."id"
      AND r."upstreamModel" ~* '(gpt-image|dall-?e|[-_]edit|inpaint)'
  );

-- 2. 其余可参考图家族（grok-imagine-image / seedream / flux 等）：只补参考图能力。
UPDATE "UserModel" AS um
SET "options" = jsonb_set(
  COALESCE(um."options", '{}'::jsonb),
  '{imageCapabilities}',
  COALESCE(um."options" -> 'imageCapabilities', '{}'::jsonb) || '{"supportsReference": true}'::jsonb,
  true
)
WHERE um."capability" = 'IMAGE'
  AND um."apiProtocol" <> 'gemini'
  AND COALESCE(um."options" -> 'imageCapabilities' ->> 'supportsReference', 'false') <> 'true'
  AND EXISTS (
    SELECT 1 FROM "UserModelRoute" AS r
    WHERE r."userModelId" = um."id"
      AND r."upstreamModel" ~* '(grok-imagine-image|seedream|flux|qwen-image|nano-?banana|imagen)'
  );
