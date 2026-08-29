-- Bind only platform-native tools to the official assistant presets. Existing
-- bindings and administrator configuration remain untouched.
INSERT INTO "AssistantTool" ("assistantId", "toolId") VALUES
  ('xinyue_assistant_general', 'xinyue_tool_project_context'),
  ('xinyue_assistant_general', 'xinyue_tool_file_catalog'),
  ('xinyue_assistant_general', 'xinyue_tool_current_time'),
  ('xinyue_assistant_research', 'xinyue_tool_project_context'),
  ('xinyue_assistant_research', 'xinyue_tool_file_catalog'),
  ('xinyue_assistant_research', 'xinyue_tool_current_time'),
  ('xinyue_assistant_office', 'xinyue_tool_project_context'),
  ('xinyue_assistant_office', 'xinyue_tool_file_catalog'),
  ('xinyue_assistant_office', 'xinyue_tool_current_time'),
  ('xinyue_assistant_data', 'xinyue_tool_file_catalog'),
  ('xinyue_assistant_data', 'xinyue_tool_data_summary'),
  ('xinyue_assistant_data', 'xinyue_tool_current_time'),
  ('xinyue_assistant_code', 'xinyue_tool_project_context'),
  ('xinyue_assistant_code', 'xinyue_tool_file_catalog'),
  ('xinyue_assistant_code', 'xinyue_tool_current_time'),
  ('xinyue_assistant_meeting', 'xinyue_tool_file_catalog'),
  ('xinyue_assistant_meeting', 'xinyue_tool_current_time')
ON CONFLICT ("assistantId", "toolId") DO NOTHING;
