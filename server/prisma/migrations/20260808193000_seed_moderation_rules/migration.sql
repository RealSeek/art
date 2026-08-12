INSERT INTO "ModerationRule" ("id", "name", "category", "type", "pattern", "action", "caseSensitive", "enabled", "sortOrder", "description", "createdAt", "updatedAt") VALUES
  ('baseline-child-safety', '未成年人性内容', '未成年人安全', 'REGEX', '儿童色情|未成年人色情|性侵儿童', 'BLOCK', false, true, 10, '高风险违法内容直接阻断', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('baseline-explosives', '爆炸物制作指导', '危险行为', 'REGEX', '(制作|制造).{0,8}(炸弹|爆炸物)', 'REVIEW', false, true, 20, '可能造成现实伤害的操作指导转人工审核', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('baseline-self-harm', '自伤方法指导', '人身安全', 'REGEX', '(自杀|自残).{0,8}(方法|教程)|如何.{0,4}(自杀|自残)', 'REVIEW', false, true, 30, '自伤方法请求转人工审核', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('baseline-credential-theft', '账户凭证窃取', '网络安全', 'REGEX', '(盗取|窃取|绕过).{0,10}(密码|验证码|登录凭证)', 'REVIEW', false, true, 40, '凭证窃取或登录绕过请求转人工审核', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
