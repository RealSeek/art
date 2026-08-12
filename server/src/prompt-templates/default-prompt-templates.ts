export type DefaultPromptTemplate = {
  id: string
  title: string
  description: string
  prompt: string
  category: string
  variables: string[]
  sortOrder: number
}

export const DEFAULT_PROMPT_TEMPLATES: DefaultPromptTemplate[] = [
  {
    id: 'prompt-rewrite', title: '润色与改写', category: '写作', sortOrder: 10,
    description: '保持原意，改善表达、结构和可读性。', variables: ['content'],
    prompt: '请将下面的内容进行专业润色：\n\n{{content}}\n\n要求：保持原意，优化结构和措辞，并输出可直接使用的版本。',
  },
  {
    id: 'prompt-structured-summary', title: '结构化总结', category: '写作', sortOrder: 20,
    description: '从长内容中提取结论、依据和行动项。', variables: ['content'],
    prompt: '请总结以下内容：\n\n{{content}}\n\n按“核心结论、关键依据、重要数据、行动项、待确认问题”组织。不要补充原文没有的信息。',
  },
  {
    id: 'prompt-continue-writing', title: '续写与补全', category: '写作', sortOrder: 30,
    description: '沿用原文语气和逻辑自然续写。', variables: ['content', 'direction'],
    prompt: '请续写以下内容：\n\n{{content}}\n\n续写方向：{{direction}}\n\n保持人物、事实、视角和语言风格一致，避免重复前文。',
  },
  {
    id: 'prompt-accurate-translation', title: '专业翻译', category: '写作', sortOrder: 40,
    description: '按目标语言和使用场景完成自然翻译。', variables: ['content', 'language', 'scenario'],
    prompt: '将以下内容翻译为{{language}}：\n\n{{content}}\n\n使用场景：{{scenario}}。保留专有名词、数字和格式，表达自然，不逐字硬译。',
  },
  {
    id: 'prompt-meeting-summary', title: '会议纪要', category: '办公', sortOrder: 110,
    description: '将零散记录整理成行动项明确的会议纪要。', variables: ['notes'],
    prompt: '请将下面的会议记录整理为结构化纪要：\n\n{{notes}}\n\n请包含：结论、待办事项、负责人、截止时间和未决问题；不确定的信息请明确标注。',
  },
  {
    id: 'prompt-business-email', title: '商务邮件', category: '办公', sortOrder: 120,
    description: '生成清晰、礼貌且有明确下一步的邮件。', variables: ['recipient', 'goal', 'context'],
    prompt: '请起草一封商务邮件。\n收件人：{{recipient}}\n目的：{{goal}}\n背景：{{context}}\n\n要求主题明确、正文简洁、语气专业，并给出清晰的下一步。',
  },
  {
    id: 'prompt-weekly-report', title: '周报整理', category: '办公', sortOrder: 130,
    description: '把工作记录整理为结果导向的周报。', variables: ['notes'],
    prompt: '根据以下工作记录生成周报：\n\n{{notes}}\n\n按“本周成果、关键数据、问题与风险、下周计划、需要协助”输出，突出结果而非流水账。',
  },
  {
    id: 'prompt-project-plan', title: '项目执行计划', category: '办公', sortOrder: 140,
    description: '把目标拆成里程碑、任务、风险和验收标准。', variables: ['goal', 'deadline', 'resources'],
    prompt: '为以下项目制定执行计划：\n目标：{{goal}}\n期限：{{deadline}}\n可用资源：{{resources}}\n\n请包含范围、里程碑、任务分工、依赖、风险、验收标准和复盘节点。',
  },
  {
    id: 'prompt-product-copy', title: '商品卖点提炼', category: '营销', sortOrder: 210,
    description: '从商品信息中提炼清晰、可信、可转化的卖点。', variables: ['product'],
    prompt: '请根据以下商品信息提炼商品卖点：\n\n{{product}}\n\n请输出：核心卖点、目标人群、使用场景、注意事项。避免夸大和无法验证的承诺。',
  },
  {
    id: 'prompt-ad-variants', title: '广告文案变体', category: '营销', sortOrder: 220,
    description: '针对不同诉求生成可测试的广告版本。', variables: ['product', 'audience', 'platform'],
    prompt: '为{{product}}面向{{audience}}生成 5 组适用于{{platform}}的广告文案。每组包含标题、正文、行动号召和主打角度，并说明适合测试的变量。',
  },
  {
    id: 'prompt-audience-persona', title: '用户画像', category: '营销', sortOrder: 230,
    description: '根据已有信息形成可执行的目标用户画像。', variables: ['business', 'evidence'],
    prompt: '为以下业务建立目标用户画像：\n业务：{{business}}\n已有证据：{{evidence}}\n\n输出用户目标、痛点、触发场景、决策阻力、信息渠道和转化建议，并区分事实与假设。',
  },
  {
    id: 'prompt-campaign-plan', title: '营销活动方案', category: '营销', sortOrder: 240,
    description: '从目标到渠道、节奏和指标规划完整活动。', variables: ['goal', 'audience', 'budget'],
    prompt: '设计一套营销活动。\n目标：{{goal}}\n受众：{{audience}}\n预算：{{budget}}\n\n请给出核心策略、渠道组合、内容主题、时间节奏、转化路径、指标和风险预案。',
  },
  {
    id: 'prompt-code-review', title: '代码审查', category: '编程', sortOrder: 310,
    description: '按风险优先级检查代码中的问题并给出修复建议。', variables: ['code'],
    prompt: '请审查下面的代码：\n\n{{code}}\n\n请优先指出会导致错误、数据丢失、安全风险或兼容性问题的地方，并给出最小可行修复建议。',
  },
  {
    id: 'prompt-debug-assistant', title: '错误诊断', category: '编程', sortOrder: 320,
    description: '结合报错和上下文定位根因并给出验证步骤。', variables: ['error', 'context', 'code'],
    prompt: '请诊断以下问题。\n报错：{{error}}\n运行环境与复现步骤：{{context}}\n相关代码：\n{{code}}\n\n请给出最可能根因、排查顺序、修复方案和回归验证项。',
  },
  {
    id: 'prompt-test-cases', title: '测试用例设计', category: '编程', sortOrder: 330,
    description: '根据需求生成正常、边界和异常测试。', variables: ['requirement', 'stack'],
    prompt: '为以下需求设计测试用例：\n{{requirement}}\n技术栈：{{stack}}\n\n覆盖正常路径、边界条件、权限、安全、并发和失败恢复；给出测试数据、步骤和预期结果。',
  },
  {
    id: 'prompt-api-design', title: 'API 设计', category: '编程', sortOrder: 340,
    description: '设计可演进、可验证的接口契约。', variables: ['feature', 'constraints'],
    prompt: '为以下功能设计 API：\n功能：{{feature}}\n约束：{{constraints}}\n\n请给出端点、方法、鉴权、请求响应结构、错误码、幂等、分页和版本兼容策略。',
  },
  {
    id: 'prompt-concept-tutor', title: '概念讲解', category: '学习', sortOrder: 410,
    description: '按学习者水平分层解释复杂概念。', variables: ['topic', 'level'],
    prompt: '请向{{level}}水平的学习者讲解“{{topic}}”。先给直观解释，再给准确定义、例子、常见误区和一个自测问题。',
  },
  {
    id: 'prompt-learning-plan', title: '学习计划', category: '学习', sortOrder: 420,
    description: '根据目标和可用时间安排阶段化学习路径。', variables: ['goal', 'duration', 'baseline'],
    prompt: '制定学习计划。\n目标：{{goal}}\n周期：{{duration}}\n当前基础：{{baseline}}\n\n按周给出主题、练习、输出物、检查点和调整标准。',
  },
  {
    id: 'prompt-quiz-generator', title: '练习题生成', category: '学习', sortOrder: 430,
    description: '生成由浅入深并附解析的练习题。', variables: ['topic', 'difficulty'],
    prompt: '围绕“{{topic}}”生成 10 道{{difficulty}}练习题，包含选择、简答和应用题。先列题目，最后单独给答案、解析和考查点。',
  },
  {
    id: 'prompt-paper-reading', title: '论文阅读助手', category: '学习', sortOrder: 440,
    description: '提取研究问题、方法、证据和局限。', variables: ['paper'],
    prompt: '阅读以下论文内容：\n\n{{paper}}\n\n提取研究问题、核心方法、数据与实验、主要结论、创新点、局限和可复现性风险；不要把作者观点当作已证实事实。',
  },
  {
    id: 'prompt-option-comparison', title: '方案对比', category: '分析', sortOrder: 510,
    description: '按统一维度比较多个候选方案。', variables: ['options', 'criteria'],
    prompt: '比较以下方案：{{options}}\n评估标准：{{criteria}}\n\n使用统一维度列出优势、缺点、成本、风险和适用条件，最后给出有条件的建议，不要假装存在唯一答案。',
  },
  {
    id: 'prompt-data-insights', title: '数据洞察', category: '分析', sortOrder: 520,
    description: '从数据中识别趋势、异常和可验证假设。', variables: ['data', 'goal'],
    prompt: '分析以下数据：\n{{data}}\n分析目标：{{goal}}\n\n指出趋势、分布、异常、可能解释和数据限制，并给出下一步需要验证的假设。相关性不要表述为因果。',
  },
  {
    id: 'prompt-decision-memo', title: '决策备忘录', category: '分析', sortOrder: 530,
    description: '把复杂选择整理为可审议的决策材料。', variables: ['decision', 'facts'],
    prompt: '为以下决策撰写备忘录：\n决策事项：{{decision}}\n已知事实：{{facts}}\n\n包含背景、目标、选项、权衡、风险、建议、反对意见和触发重新评估的条件。',
  },
  {
    id: 'prompt-risk-review', title: '风险评估', category: '分析', sortOrder: 540,
    description: '识别业务、技术、合规和执行风险。', variables: ['plan'],
    prompt: '评估以下计划的风险：\n{{plan}}\n\n按发生概率和影响程度排序，覆盖业务、技术、数据、安全、合规和执行风险，并给出预防措施、监控指标和应急预案。',
  },
  {
    id: 'prompt-product-hero-image', title: '商品主视觉', category: '图片', sortOrder: 610,
    description: '生成突出商品本体和卖点的商业主视觉。', variables: ['product', 'style', 'ratio'],
    prompt: '生成{{product}}的商业主视觉，画面比例{{ratio}}，视觉风格{{style}}。商品外观、包装文字和结构必须准确，主体清晰完整，光线自然，背景服务于卖点，预留标题区域，不添加虚构认证或参数。',
  },
  {
    id: 'prompt-editorial-portrait', title: '杂志人像', category: '图片', sortOrder: 620,
    description: '生成自然、有叙事感的编辑类人像。', variables: ['subject', 'setting', 'mood'],
    prompt: '创作一张{{subject}}的杂志编辑人像，场景为{{setting}}，情绪{{mood}}。保持自然肤质和真实比例，使用有方向性的柔和光线、克制的色彩和清晰的环境叙事，避免过度磨皮。',
  },
  {
    id: 'prompt-campaign-poster', title: '活动海报', category: '图片', sortOrder: 630,
    description: '生成层级清楚并预留文案区域的活动海报。', variables: ['theme', 'audience', 'ratio'],
    prompt: '为“{{theme}}”设计面向{{audience}}的活动海报，比例{{ratio}}。建立明确视觉焦点和信息层级，预留主标题、副标题、日期和行动按钮区域，保证移动端缩略图下仍清楚可读。',
  },
  {
    id: 'prompt-image-edit', title: '图片局部修改', category: '图片', sortOrder: 640,
    description: '在保留原图一致性的前提下执行指定修改。', variables: ['change', 'preserve'],
    prompt: '编辑参考图片：{{change}}。必须保持{{preserve}}不变，并维持原图主体身份、透视、光线方向、材质、阴影和整体色彩一致。修改区域边缘自然，不改变未指定内容。',
  },
]
