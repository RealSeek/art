-- MiniMax H3 的分辨率由模型后缀约束，保留已有其他参数与定价。
UPDATE "UserModel" AS model
SET options = COALESCE(model.options, '{}'::jsonb) || jsonb_build_object(
      'videoCapabilities', COALESCE(model.options->'videoCapabilities', '{}'::jsonb) ||
        jsonb_build_object('resolutions', jsonb_build_array(matched.resolution), 'defaultResolution', matched.resolution)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT route."userModelId", lower(substring(route."upstreamModel" FROM '(?i)minimaxh3-([0-9]{3,4}p)(?:-|$)')) AS resolution
  FROM "UserModelRoute" route
  JOIN "UserApiCredential" credential ON credential.id = route."credentialId"
  WHERE credential."providerType" = 'NEW_API'
    AND route."upstreamModel" ~* 'minimaxh3-[0-9]{3,4}p(-|$)'
) AS matched
WHERE model.id = matched."userModelId" AND model.capability = 'VIDEO';
