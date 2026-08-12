CREATE TABLE "ToolApprovalRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "assistantId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL DEFAULT '',
  "adminNote" TEXT NOT NULL DEFAULT '',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolApprovalRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ToolApprovalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ToolApprovalRequest_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ToolApprovalRequest_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ToolApprovalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ToolApprovalRequest_userId_status_createdAt_idx" ON "ToolApprovalRequest"("userId", "status", "createdAt");
CREATE INDEX "ToolApprovalRequest_status_createdAt_idx" ON "ToolApprovalRequest"("status", "createdAt");
CREATE INDEX "ToolApprovalRequest_toolId_assistantId_status_idx" ON "ToolApprovalRequest"("toolId", "assistantId", "status");

INSERT INTO "Assistant" ("id", "name", "description", "systemPrompt", "defaultModel", "templateIds", "enabled", "visibility", "sortOrder", "createdAt", "updatedAt")
SELECT 'xinyue_assistant_commerce', '商品视觉策划', '将商品信息拆解为可执行的主图、详情页和投放素材方案。', '你是商品视觉策划助手。先澄清商品、用户、渠道和转化目标，再输出视觉定位、镜头清单、文案层级、生成提示词与验收标准。不要虚构产品参数。', '', '[]'::jsonb, true, 'PUBLIC', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Assistant" WHERE "id" = 'xinyue_assistant_commerce');

INSERT INTO "Assistant" ("id", "name", "description", "systemPrompt", "defaultModel", "templateIds", "enabled", "visibility", "sortOrder", "createdAt", "updatedAt")
SELECT 'xinyue_assistant_copy', '商业文案助手', '面向品牌、电商与社交媒体的结构化文案工作助手。', '你是商业文案助手。根据品牌语调、目标受众和发布渠道产出可直接使用的文案。先给主方案，再给可测试变体；明确事实依据，不编造背书、销量和功效。', '', '[]'::jsonb, true, 'PUBLIC', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Assistant" WHERE "id" = 'xinyue_assistant_copy');

INSERT INTO "Assistant" ("id", "name", "description", "systemPrompt", "defaultModel", "templateIds", "enabled", "visibility", "sortOrder", "createdAt", "updatedAt")
SELECT 'xinyue_assistant_support', '知识服务助手', '基于已绑定知识库回答产品、流程与服务问题。', '你是知识服务助手。优先依据绑定知识库回答；当资料不足时明确说明缺口并提出需要补充的信息，不要猜测政策、价格或承诺。回答应简明、可执行并保留关键出处线索。', '', '[]'::jsonb, true, 'PUBLIC', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Assistant" WHERE "id" = 'xinyue_assistant_support');

INSERT INTO "ToolDefinition" ("id", "key", "name", "description", "endpoint", "scopes", "enabled", "requiresApproval", "createdAt", "updatedAt")
SELECT 'xinyue_tool_webhook', 'workflow_webhook', '工作流 Webhook', '向管理员配置的业务工作流发送结构化任务。配置 Endpoint 并完成审批后可用。', '', '["workflow:execute"]'::jsonb, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ToolDefinition" WHERE "key" = 'workflow_webhook');

INSERT INTO "ToolDefinition" ("id", "key", "name", "description", "endpoint", "scopes", "enabled", "requiresApproval", "createdAt", "updatedAt")
SELECT 'xinyue_tool_search', 'knowledge_search', '企业知识检索', '调用企业内部检索服务补充实时资料。配置 Endpoint 后由管理员控制开放范围。', '', '["knowledge:read"]'::jsonb, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ToolDefinition" WHERE "key" = 'knowledge_search');

INSERT INTO "ToolDefinition" ("id", "key", "name", "description", "endpoint", "scopes", "enabled", "requiresApproval", "createdAt", "updatedAt")
SELECT 'xinyue_tool_ticket', 'support_ticket', '创建客服工单', '将对话摘要和用户问题提交到外部客服系统。', '', '["support:write"]'::jsonb, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ToolDefinition" WHERE "key" = 'support_ticket');

INSERT INTO "ToolDefinition" ("id", "key", "name", "description", "endpoint", "scopes", "enabled", "requiresApproval", "createdAt", "updatedAt")
SELECT 'xinyue_tool_asset', 'asset_delivery', '素材交付', '将用户确认的素材信息发送到已配置的交付或归档系统。', '', '["asset:read", "delivery:write"]'::jsonb, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ToolDefinition" WHERE "key" = 'asset_delivery');
