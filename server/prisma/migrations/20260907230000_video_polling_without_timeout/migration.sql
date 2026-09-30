-- 视频任务不再使用固定 600 秒客户端超时：清理历史默认值，改为 0（不设上限），
-- 实际超时交给上游任务配置；管理员显式配置的上限仍然生效。
UPDATE "ModelPreset"
SET "options" = jsonb_set("options"::jsonb, '{videoCapabilities,maxPollSeconds}', '0'::jsonb, true)
WHERE "capability" = 'VIDEO'
  AND "options" -> 'videoCapabilities' ->> 'maxPollSeconds' = '600';

UPDATE "UserModel"
SET "options" = jsonb_set("options"::jsonb, '{videoCapabilities,maxPollSeconds}', '0'::jsonb, true)
WHERE "capability" = 'VIDEO'
  AND "options" -> 'videoCapabilities' ->> 'maxPollSeconds' = '600';
