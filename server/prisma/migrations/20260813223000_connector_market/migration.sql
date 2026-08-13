CREATE TYPE "ConnectorAuthType" AS ENUM ('NONE', 'API_KEY', 'OAUTH2', 'BASIC');
CREATE TYPE "ConnectorConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR');

CREATE TABLE "ConnectorDefinition" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "icon" TEXT NOT NULL DEFAULT 'plug',
  "category" TEXT NOT NULL DEFAULT '通用',
  "authType" "ConnectorAuthType" NOT NULL DEFAULT 'NONE',
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "authorizationUrl" TEXT NOT NULL DEFAULT '',
  "tokenUrl" TEXT NOT NULL DEFAULT '',
  "userInfoUrl" TEXT NOT NULL DEFAULT '',
  "apiBaseUrl" TEXT NOT NULL DEFAULT '',
  "clientId" TEXT NOT NULL DEFAULT '',
  "encryptedClientSecret" TEXT NOT NULL DEFAULT '',
  "clientSecretHint" TEXT NOT NULL DEFAULT '',
  "config" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectorConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "status" "ConnectorConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "encryptedCredentials" TEXT NOT NULL DEFAULT '',
  "credentialHint" TEXT NOT NULL DEFAULT '',
  "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "accountLabel" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectorConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConnectorConnection_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "ConnectorDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConnectorDefinition_slug_key" ON "ConnectorDefinition"("slug");
CREATE INDEX "ConnectorDefinition_enabled_featured_sortOrder_idx" ON "ConnectorDefinition"("enabled", "featured", "sortOrder");
CREATE INDEX "ConnectorDefinition_category_enabled_idx" ON "ConnectorDefinition"("category", "enabled");
CREATE UNIQUE INDEX "ConnectorConnection_userId_connectorId_key" ON "ConnectorConnection"("userId", "connectorId");
CREATE INDEX "ConnectorConnection_connectorId_status_idx" ON "ConnectorConnection"("connectorId", "status");
CREATE INDEX "ConnectorConnection_userId_status_idx" ON "ConnectorConnection"("userId", "status");

INSERT INTO "PluginCategory" ("id", "name", "slug", "description", "icon", "sortOrder", "enabled", "updatedAt") VALUES
  ('plugin_category_research', '研究分析', 'research', '调研、阅读、数据与专业资料整理', 'search-check', 50, true, CURRENT_TIMESTAMP),
  ('plugin_category_content', '内容创作', 'content', '品牌、媒体与多平台内容生产', 'notebook-pen', 60, true, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "icon" = EXCLUDED."icon", "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "Plugin" ("id", "categoryId", "name", "slug", "description", "instruction", "icon", "version", "capabilities", "recommendedModel", "outputRequirements", "visibility", "status", "featured", "priceCredits", "sortOrder", "updatedAt") VALUES
  ('plugin_official_research', 'plugin_category_research', '联网调研', 'web-research', '围绕目标检索、交叉核验并形成带来源的调研结论。', '先定义调研问题和证据标准，再检索多个独立来源。区分事实、推断和未知信息；发现来源冲突时并列说明，不得编造引用。', 'search-check', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '给出摘要、关键发现、来源清单、风险和下一步建议。', 'OFFICIAL', 'PUBLISHED', true, 0, 40, CURRENT_TIMESTAMP),
  ('plugin_official_ppt', 'plugin_category_productivity', 'PPT 策划', 'ppt-planner', '把主题转化为可直接制作的演示文稿结构、页面文案和视觉建议。', '先识别演示对象、时长和目标，再建立叙事主线。逐页规划标题、核心观点、证据、图表或视觉素材，不堆砌文字。', 'presentation', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '输出封面、目录、逐页内容、演讲备注和素材清单。', 'OFFICIAL', 'PUBLISHED', true, 0, 50, CURRENT_TIMESTAMP),
  ('plugin_official_spreadsheet', 'plugin_category_productivity', '表格分析', 'spreadsheet-analyst', '清洗和理解表格数据，产出指标、异常、图表与经营结论。', '先核对字段含义、单位、时间范围和缺失值，再计算指标。明确计算口径，识别异常值和相关性，避免将相关性表述为因果关系。', 'table-2', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '输出口径说明、关键指标、异常发现、推荐图表和可执行建议。', 'OFFICIAL', 'PUBLISHED', false, 0, 60, CURRENT_TIMESTAMP),
  ('plugin_official_meeting', 'plugin_category_productivity', '会议纪要', 'meeting-minutes', '从会议内容提炼决策、行动项、负责人和截止时间。', '保留事实与原意，按议题整理讨论内容，明确区分已决定、待确认和建议事项。不得猜测未提及的负责人或日期。', 'notebook-tabs', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '输出会议摘要、决策、行动项表格、风险与待跟进问题。', 'OFFICIAL', 'PUBLISHED', false, 0, 70, CURRENT_TIMESTAMP),
  ('plugin_official_business_report', 'plugin_category_research', '商业报告', 'business-report', '将市场、经营和竞争信息整理为决策型商业报告。', '围绕业务问题组织证据，分析市场、用户、竞争、财务影响和风险。所有数字说明来源或计算口径，并给出可验证的假设。', 'chart-no-axes-combined', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '结论前置，包含数据依据、方案比较、风险和执行路线图。', 'OFFICIAL', 'PUBLISHED', true, 0, 80, CURRENT_TIMESTAMP),
  ('plugin_official_code_review', 'plugin_category_development', '代码审查', 'code-review', '从正确性、安全性、性能和可维护性审查代码变更。', '优先发现可复现的缺陷、行为回归、安全风险和缺失测试。按严重程度排序，每项说明触发条件、影响和修复方向；不要把纯偏好当作缺陷。', 'scan-code', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '先列问题，再列假设和简短总结；引用具体文件与位置。', 'OFFICIAL', 'PUBLISHED', true, 0, 90, CURRENT_TIMESTAMP),
  ('plugin_official_tech_plan', 'plugin_category_development', '技术方案', 'technical-design', '形成边界清晰、可落地且可评审的系统设计方案。', '先明确目标、非目标、约束和现状，再设计组件、数据、接口、失败处理、迁移和观测方案。对关键选择列出替代方案和取舍。', 'network', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '包含架构、数据流、接口、风险、发布计划和验收标准。', 'OFFICIAL', 'PUBLISHED', false, 0, 100, CURRENT_TIMESTAMP),
  ('plugin_official_marketing', 'plugin_category_content', '营销文案', 'marketing-copy', '根据品牌、受众和渠道生成自然、有转化目标的营销文案。', '先提炼真实卖点和目标行动，再匹配渠道语气。避免虚假承诺、绝对化用语和空泛形容词，保留品牌一致性。', 'megaphone', '1.0.0', ARRAY['CHAT','COMMERCE','OFFICE']::"PluginCapability"[], '', '提供主版本、备选标题、行动号召和合规检查。', 'OFFICIAL', 'PUBLISHED', false, 0, 110, CURRENT_TIMESTAMP),
  ('plugin_official_social', 'plugin_category_content', '社交媒体运营', 'social-operations', '策划选题、内容日历和适配不同平台的发布稿。', '围绕目标受众和运营目标制定内容支柱，针对平台调整篇幅、开头、节奏和互动方式。不要伪造热点或数据。', 'messages-square', '1.0.0', ARRAY['CHAT','IMAGE','VIDEO','OFFICE']::"PluginCapability"[], '', '输出选题、发布稿、视觉建议、标签建议和复盘指标。', 'OFFICIAL', 'PUBLISHED', false, 0, 120, CURRENT_TIMESTAMP),
  ('plugin_official_seo', 'plugin_category_content', 'SEO 内容', 'seo-content', '基于搜索意图规划清晰、可信且可读的长内容。', '识别主要搜索意图、主题实体和读者问题，设计自然的信息层级。关键词必须服务于语义，不机械堆叠；重要事实标记来源需求。', 'file-search', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '输出标题、摘要、结构、正文、FAQ 和元描述。', 'OFFICIAL', 'PUBLISHED', false, 0, 130, CURRENT_TIMESTAMP),
  ('plugin_official_brand_visual', 'plugin_category_creative', '品牌视觉', 'brand-visual', '把品牌定位转化为一致的图片语言和系列化视觉方案。', '先提取品牌人格、受众、场景和禁用项，再定义构图、色彩、光线、材质、字体氛围和连续性规则。', 'badge-palette', '1.0.0', ARRAY['IMAGE','VIDEO','COMMERCE']::"PluginCapability"[], '', '输出视觉方向、提示词、负面约束和系列一致性检查表。', 'OFFICIAL', 'PUBLISHED', false, 0, 140, CURRENT_TIMESTAMP),
  ('plugin_official_product_detail', 'plugin_category_commerce', '商品详情页', 'product-detail-page', '规划商品详情页的信息结构、卖点顺序和配套视觉素材。', '围绕用户决策路径组织内容：需求、卖点证据、使用场景、规格、信任和行动。保持商品事实准确，不虚构功效或认证。', 'layout-template', '1.0.0', ARRAY['COMMERCE','IMAGE','CHAT']::"PluginCapability"[], '', '输出模块顺序、每屏文案、图片提示词和素材拍摄清单。', 'OFFICIAL', 'PUBLISHED', true, 0, 150, CURRENT_TIMESTAMP),
  ('plugin_official_storyboard', 'plugin_category_creative', '视频分镜', 'video-storyboard', '把创意转化为镜头可执行的视频分镜和生成提示词。', '根据时长和节奏拆分镜头，逐镜说明景别、运动、动作、环境、光线、声音和转场，保持人物与场景连续性。', 'clapperboard', '1.0.0', ARRAY['VIDEO','CHAT','COMMERCE']::"PluginCapability"[], '', '输出时间轴分镜、逐镜提示词、连续性约束和声音建议。', 'OFFICIAL', 'PUBLISHED', true, 0, 160, CURRENT_TIMESTAMP),
  ('plugin_official_academic', 'plugin_category_research', '学术阅读', 'academic-reading', '拆解论文问题、方法、证据、局限和可复现要点。', '忠实区分作者结论与自己的解释，提取研究问题、样本、方法、指标和局限。遇到缺失信息明确说明，不补造实验结果。', 'graduation-cap', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '输出结构化摘要、方法评价、关键证据、局限和延伸问题。', 'OFFICIAL', 'PUBLISHED', false, 0, 170, CURRENT_TIMESTAMP),
  ('plugin_official_legal', 'plugin_category_research', '法律文档整理', 'legal-document', '整理合同和法律材料的结构、条款差异与待审风险。', '仅进行信息整理，不冒充律师给出确定法律结论。引用原文定位条款，标明缺失信息、异常义务、期限和责任分配。', 'scale', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '输出摘要、条款清单、差异、风险提示和需专业复核事项。', 'OFFICIAL', 'PUBLISHED', false, 0, 180, CURRENT_TIMESTAMP),
  ('plugin_official_finance', 'plugin_category_research', '财务数据解读', 'financial-analysis', '解释财务报表与经营指标变化，识别异常和现金流风险。', '核对币种、期间和会计口径，分解收入、成本、利润、现金流和周转变化。不得把估计当作审计结论或投资建议。', 'landmark', '1.0.0', ARRAY['CHAT','OFFICE']::"PluginCapability"[], '', '输出指标摘要、同比环比、驱动因素、异常项、风险和核验清单。', 'OFFICIAL', 'PUBLISHED', false, 0, 190, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ConnectorDefinition" ("id", "name", "slug", "description", "icon", "category", "authType", "scopes", "apiBaseUrl", "enabled", "featured", "sortOrder", "updatedAt") VALUES
  ('connector_web_reader', '网页读取', 'web-reader', '读取公开网页正文，为调研、摘要和事实核验提供上下文。', 'globe-2', '网页与搜索', 'NONE', ARRAY['读取公开网页'], '', true, true, 10, CURRENT_TIMESTAMP),
  ('connector_github', 'GitHub', 'github', '访问获授权的仓库、Issue、Pull Request 和代码内容。', 'github', '研发协作', 'OAUTH2', ARRAY['读取个人资料','读取仓库','读取 Issue 和 PR'], 'https://api.github.com', false, true, 20, CURRENT_TIMESTAMP),
  ('connector_feishu', '飞书', 'feishu', '读取飞书文档、知识库和云空间内容，用于办公协作。', 'message-square-more', '办公协作', 'OAUTH2', ARRAY['读取用户身份','读取云文档','读取知识库'], 'https://open.feishu.cn/open-apis', false, true, 30, CURRENT_TIMESTAMP),
  ('connector_notion', 'Notion', 'notion', '读取获授权的页面和数据库，将团队资料用于问答与任务。', 'notebook', '知识与文档', 'OAUTH2', ARRAY['读取页面','读取数据库'], 'https://api.notion.com', false, true, 40, CURRENT_TIMESTAMP),
  ('connector_google_drive', 'Google Drive', 'google-drive', '检索和读取获授权的云端文件与文档。', 'hard-drive-download', '云存储', 'OAUTH2', ARRAY['读取文件列表','读取文件内容'], 'https://www.googleapis.com/drive/v3', false, false, 50, CURRENT_TIMESTAMP),
  ('connector_onedrive', 'OneDrive', 'onedrive', '检索和读取 Microsoft 365 云端文件。', 'cloud', '云存储', 'OAUTH2', ARRAY['读取用户资料','读取文件'], 'https://graph.microsoft.com/v1.0', false, false, 60, CURRENT_TIMESTAMP),
  ('connector_webdav', 'WebDAV', 'webdav', '连接支持 WebDAV 的私有文件服务，读取授权目录。', 'folder-sync', '云存储', 'BASIC', ARRAY['列出目录','读取文件'], '', false, false, 70, CURRENT_TIMESTAMP),
  ('connector_knowledge_api', '企业知识库', 'enterprise-knowledge', '通过管理员配置的 API 接入企业内部知识检索服务。', 'database-zap', '知识与文档', 'API_KEY', ARRAY['检索知识','读取文档片段'], '', false, false, 80, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
