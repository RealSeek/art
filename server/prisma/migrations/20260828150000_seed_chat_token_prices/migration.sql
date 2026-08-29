-- Seed non-zero customer token rates for the built-in chat models.
-- Existing administrator overrides are preserved; only zero-priced rows are filled.
UPDATE "ModelPreset" SET "inputCreditsPerMillion" = CASE "key"
  WHEN 'gpt-5.5' THEN 260 WHEN 'gpt-5.6-sol' THEN 260 WHEN 'gpt-5.6-terra' THEN 260 WHEN 'gpt-5.6-luna' THEN 260
  WHEN 'grok-4.5' THEN 390 WHEN 'claude-sonnet' THEN 390 WHEN 'gemini-pro' THEN 163 WHEN 'deepseek-chat' THEN 36 WHEN 'qwen-max' THEN 100
  ELSE "inputCreditsPerMillion" END,
  "outputCreditsPerMillion" = CASE "key"
  WHEN 'gpt-5.5' THEN 1040 WHEN 'gpt-5.6-sol' THEN 1040 WHEN 'gpt-5.6-terra' THEN 1040 WHEN 'gpt-5.6-luna' THEN 1040
  WHEN 'grok-4.5' THEN 1300 WHEN 'claude-sonnet' THEN 1950 WHEN 'gemini-pro' THEN 1300 WHEN 'deepseek-chat' THEN 143 WHEN 'qwen-max' THEN 300
  ELSE "outputCreditsPerMillion" END
WHERE "capability" = 'CHAT' AND "inputCreditsPerMillion" = 0 AND "outputCreditsPerMillion" = 0;

UPDATE "ModelPriceVersion" AS v SET "inputCreditsPerMillion" = p."inputCreditsPerMillion", "outputCreditsPerMillion" = p."outputCreditsPerMillion"
FROM "ModelPreset" AS p
WHERE v."modelPresetId" = p."id" AND p."capability" = 'CHAT' AND v."inputCreditsPerMillion" = 0 AND v."outputCreditsPerMillion" = 0;
