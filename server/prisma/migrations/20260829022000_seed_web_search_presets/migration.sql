-- Search integrations are templates only: no credentials are embedded and all
-- channels remain disabled until an administrator completes configuration.
INSERT INTO "WebSearchChannel" ("id", "name", "type", "endpoint", "encryptedApiKey", "apiKeyHint", "enabled", "priority", "timeoutMs", "maxResults", "config", "createdAt", "updatedAt") VALUES
  ('xinyue_search_searxng', 'SearXNG（自托管）', 'SEARXNG', '', '', '', false, 100, 30000, 8, '{"presetKey":"xinyue_search_searxng","documentationUrl":"https://docs.searxng.org/admin/installation-docker.html"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('xinyue_search_tavily', 'Tavily Search', 'TAVILY', 'https://api.tavily.com/search', '', '', false, 90, 30000, 8, '{"presetKey":"xinyue_search_tavily","documentationUrl":"https://docs.tavily.com/documentation/api-reference/endpoint/search"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('xinyue_search_serper', 'Google Serper', 'SERPER', 'https://google.serper.dev/search', '', '', false, 80, 30000, 8, '{"presetKey":"xinyue_search_serper","documentationUrl":"https://serper.dev/"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('xinyue_search_brave', 'Brave Search', 'BRAVE', 'https://api.search.brave.com/res/v1/web/search', '', '', false, 70, 30000, 8, '{"presetKey":"xinyue_search_brave","documentationUrl":"https://api-dashboard.search.brave.com/app/documentation/web-search/get-started"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('xinyue_search_exa', 'Exa Search', 'EXA', 'https://api.exa.ai/search', '', '', false, 60, 30000, 8, '{"presetKey":"xinyue_search_exa","documentationUrl":"https://docs.exa.ai/reference/search"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
