-- 修正 OnlyCode 自动导入的 Gemini 图片模型，保留已有定价和其他模型配置。
UPDATE "UserModel" AS model
SET "apiProtocol" = 'gemini',
    "options" = COALESCE(model."options", '{}'::jsonb) || jsonb_build_object(
      'apiProtocol', 'gemini',
      'imageCapabilities', COALESCE(model."options"->'imageCapabilities', '{}'::jsonb) ||
        '{"supportsReference":true,"supportsMask":false,"outputFormats":["png"],"backgrounds":["opaque"],"maxCount":1}'::jsonb
    )
WHERE model."capability" = 'IMAGE'
  AND EXISTS (
    SELECT 1 FROM "UserModelRoute" AS route
    JOIN "UserApiCredential" AS credential ON credential.id = route."credentialId"
    WHERE route."userModelId" = model.id
      AND credential."providerType" = 'NEW_API'
      AND route."upstreamModel" ~* '^gemini-[a-z0-9.-]*image(-|$)'
  );
