ALTER TABLE "ProviderTemplate"
ADD COLUMN "nativeSearchProvider" TEXT NOT NULL DEFAULT 'disabled';

UPDATE "ProviderTemplate"
SET "nativeSearchProvider" = CASE "key"
  WHEN 'openai' THEN 'openai'
  WHEN 'anthropic' THEN 'anthropic'
  WHEN 'gemini' THEN 'gemini'
  WHEN 'xai' THEN 'xai'
  WHEN 'qwen' THEN 'qwen'
  WHEN 'doubao' THEN 'doubao'
  ELSE 'disabled'
END;
