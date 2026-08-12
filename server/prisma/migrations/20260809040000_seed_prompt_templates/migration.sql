INSERT INTO "PromptTemplate" ("id", "title", "description", "prompt", "category", "variables", "enabled", "sortOrder", "updatedAt")
VALUES
  ('prompt-rewrite', '润色与改写', '保持原意，改善表达、结构和可读性。', E'请将下面的内容进行专业润色：\n\n{{content}}\n\n要求：保持原意，优化结构和措辞，并输出可直接使用的版本。', '写作', '["content"]'::jsonb, true, 10, CURRENT_TIMESTAMP),
  ('prompt-product-copy', '商品卖点提炼', '从商品信息中提炼清晰、可信、可转化的卖点。', E'请根据以下商品信息提炼商品卖点：\n\n{{product}}\n\n请输出：核心卖点、目标人群、使用场景、注意事项。避免夸大和无法验证的承诺。', '营销', '["product"]'::jsonb, true, 20, CURRENT_TIMESTAMP),
  ('prompt-code-review', '代码审查', '按风险优先级检查代码中的问题并给出修复建议。', E'请审查下面的代码：\n\n{{code}}\n\n请优先指出会导致错误、数据丢失、安全风险或兼容性问题的地方，并给出最小可行修复建议。', '编程', '["code"]'::jsonb, true, 30, CURRENT_TIMESTAMP),
  ('prompt-meeting-summary', '会议纪要', '将零散记录整理成行动项明确的会议纪要。', E'请将下面的会议记录整理为结构化纪要：\n\n{{notes}}\n\n请包含：结论、待办事项、负责人、截止时间和未决问题；不确定的信息请明确标注。', '办公', '["notes"]'::jsonb, true, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
