INSERT INTO "ModelVendor" (id, key, name, "sortOrder", "updatedAt")
VALUES ('vendor-minimax', 'minimax', 'MiniMax', 500, CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

-- 修正已由 OnlyCode 导入的 H3 视频模型，保留配置、定价和密钥路由。
UPDATE "UserModel" AS model
SET capability = 'VIDEO',
    "vendorId" = (SELECT id FROM "ModelVendor" WHERE key = 'minimax'),
    description = regexp_replace(model.description, '^Other ·', 'MiniMax ·'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE model.capability IN ('CHAT', 'VIDEO')
  AND model.options ? 'discovery'
  AND EXISTS (
    SELECT 1 FROM "UserModelRoute" AS route
    JOIN "UserApiCredential" AS credential ON credential.id = route."credentialId"
    WHERE route."userModelId" = model.id
      AND credential."providerType" = 'NEW_API'
      AND route."upstreamModel" ~* 'minimaxh3([-_[:space:]]|$)'
  );
