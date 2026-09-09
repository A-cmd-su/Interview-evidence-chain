// Conservative, deterministic training rubric. Rules detect evidence, not truth or job fitness.
export const RULE_VERSION = 'evidence-rubric-0.2.0';
export const SCHEMA_VERSION = 'evidence-2';
export const DIMENSIONS = ['相关性', '技术深度', '个人贡献', '量化结果', '表达结构'];
export const GAP_NAMES = ['背景', '技术方案', '个人贡献', '量化结果', '故障兜底'];
export const KNOWLEDGE_BASE = {
  'knowledge.redis-cache-aside': { title: 'Redis Cache-Aside 官方文档', summary: '缓存旁路模式覆盖命中、回源、TTL、写入失效与缓存击穿风险。', url: 'https://redis.io/docs/latest/develop/use-cases/cache-aside/', verifiedAt: '2026-09-09' },
  'knowledge.mysql-indexes': { title: 'MySQL Optimization and Indexes 官方手册', summary: '索引需要结合查询条件与执行计划验证，同时会增加写入维护成本。', url: 'https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html', verifiedAt: '2026-09-09' },
  'knowledge.rubric': { title: 'Evidence Loop 可解释训练量表', summary: '项目自建规则，仅用于训练反馈；每个分数必须绑定回答片段、岗位要求和量表版本。', url: null, verifiedAt: '2026-09-09' },
  'knowledge.interview-evidence': { title: '面试证据链方法说明', summary: '将岗位要求拆成可观察能力，再用回答原文、个人动作、结果和边界条件支持训练反馈；缺少证据时标记待补充。', url: null, verifiedAt: '2026-09-09' },
  'knowledge.interview-star': { title: 'STAR 项目回答结构', summary: '用情境、任务、行动、结果组织项目经历，帮助训练者补齐背景、个人贡献和结果。', url: null, verifiedAt: '2026-09-09' },
  'knowledge.interview-clarification': { title: '经历澄清与一致性原则', summary: '简历与回答不一致时只提出澄清问题，不直接推断造假；需要候选人补充范围、动作和验证方式。', url: null, verifiedAt: '2026-09-09' },
};
export const DEMO = {
  jd: 'Java 后端工程师。熟悉 Redis 缓存及高并发处理，能够设计故障降级方案。熟悉数据库索引与慢查询优化。能够说明个人项目职责和性能验证结果。',
  resume: '电商项目：负责系统优化，使用 Redis 缓存商品详情。参与数据库慢查询排查。',
  answer: '在电商商品详情场景，我们使用 Redis 缓存热点数据。先查询缓存，未命中时查询数据库并回填。',
};
const SKILLS = [
  { id: 'redis', label: 'Redis 缓存', pattern: /redis|缓存/i, question: '请结合项目经历，说明缓存的读写流程、你的职责，以及异常时如何处理。' },
  { id: 'database', label: '数据库优化', pattern: /数据库|mysql|sql|索引|慢查询/i, question: '请介绍一次数据库查询优化：你如何定位问题、实施方案和验证效果？' },
  { id: 'project', label: '项目经历', pattern: /项目|职责|贡献|性能|开发/i, question: '请介绍一个你参与的项目：背景是什么，你负责什么，如何验证结果？' },
];
const GAP_QUESTIONS = {
  背景: '当时是什么业务场景？请补充请求规模、问题和约束。',
  技术方案: '请具体说明处理流程、技术选型，以及为什么没有选择其他方案。',
  个人贡献: '其中哪些模块由你本人负责？请说明一个你亲自完成的动作和决策。',
  量化结果: '优化前后的指标是多少？请补充单位、测量方法和统计口径。',
  故障兜底: '如果依赖不可用或方案失效，请说明降级、限流与恢复流程。',
};
const RUBRIC_TEXT = {
  相关性: '1 分：出现岗位相关主题；3 分：说明问题与业务联系；需人工复核语义相关性。',
  技术深度: '1 分：提及方案；2 分：给出执行流程；3 分：说明取舍或异常处理；最高档需人工复核。',
  个人贡献: '2 分：明确本人动作；3 分：补充实施对象及决策；团队表述不代替个人证据。',
  量化结果: '2 分：数字及单位；3 分：前后对比；4 分：同时说明测量口径。减少、提升等词本身不是量化结果。',
  表达结构: '2 分：有因果或顺序连接；3 分：形成多步逻辑；仅评结构线索，不判断口才。',
};
export function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('请求必须是对象');
  for (const [key, max] of [['jd', 16000], ['resume', 16000], ['answer', 6000]]) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) throw new Error(`${key} 不能为空且不能超过 ${max} 字符`);
  }
  if (input.question != null && (typeof input.question !== 'string' || input.question.length > 2000)) throw new Error('问题格式不正确');
  if (input.skill != null && !SKILLS.some(s => s.id === input.skill)) throw new Error('不支持的能力标签');
  if (input.asked != null && (!Array.isArray(input.asked) || input.asked.length > 2 || input.asked.some(g => !GAP_NAMES.includes(g)))) throw new Error('追问状态不正确');
  return input;
}
function sentences(text) {
  return [...text.matchAll(/[^。！？\n；;]+[。！？\n；;]?/g)].map(m => {
    const trim = m[0].trim(), start = m.index + m[0].indexOf(trim);
    return { quote: trim, start, end: start + trim.length };
  }).filter(s => s.quote);
}
export function profile(jd) {
  const requirements = sentences(jd).map((s, i) => ({ ...s, id: `jd.${i + 1}` }));
  const skills = SKILLS.filter(s => requirements.some(r => s.pattern.test(r.quote))).map(s => ({
    id: s.id, label: s.label, requirements: requirements.filter(r => s.pattern.test(r.quote)),
  }));
  return { requirements, skills, questions: skills.map((s, i) => ({ id: `question.${s.id}`, skill: s.id, label: s.label, title: SKILLS.find(x => x.id === s.id).question, index: i + 1 })) };
}
const positive = s => !/没有|没做|未做|不了解|不清楚|不会|未实现|未负责|不负责|没有参与|没参与|未设计|不支持/.test(s);
const quantity = /\d+(?:\.\d+)?\s*(?:%|％|ms\b|毫秒|秒|QPS\b|TPS\b|万?次|万?条|GB\b|MB\b|倍)/i;
function spanFor(parts, check) { return parts.find(s => positive(s.quote) && check(s.quote)) || null; }
export function analyzeRules(input, now = new Date()) {
  validateInput(input);
  const { jd, resume, answer } = input;
  const p = profile(jd), skill = input.skill || p.skills[0]?.id;
  const selected = SKILLS.find(s => s.id === skill), requirement = p.skills.find(s => s.id === skill)?.requirements[0] || null;
  const parts = sentences(answer), background = spanFor(parts, s => /场景|业务|项目|电商|用户|请求量|瓶颈/.test(s));
  const topic = selected && spanFor(parts, s => selected.pattern.test(s));
  const technical = spanFor(parts, s => /查询|回填|加锁|索引|事务|限流|重试|队列|逻辑过期|互斥锁|熔断|读写|部署|监控/.test(s));
  const contribution = spanFor(parts, s => /我(?:独立)?(?:负责|设计|实现|排查|优化|编写|测试|主导|完成|参与)/.test(s));
  const quant = spanFor(parts, s => quantity.test(s));
  const structure = spanFor(parts, s => /首先|然后|最后|因为|所以|先.{1,30}再/.test(s));
  const fallback = spanFor(parts, s => /降级|熔断|限流|逻辑过期|互斥锁|回滚|兜底/.test(s) && /失败|异常|不可用|击穿|失效|超时|故障|恢复|热点/.test(s));
  const sourceSpans = [topic, technical, contribution, quant, structure];
  const levels = [topic ? (background ? 3 : 1) : null,
    technical ? (/取舍|因为|代价|对比|故障|降级/.test(technical.quote) ? 3 : 2) : null,
    contribution ? (contribution.quote.length > 35 ? 3 : 2) : null,
    quant ? (/压测|p99|p95|监控|统计|采样/i.test(answer) && /从|之前|之后|前后/.test(answer) ? 4 : /从|之前|之后|前后/.test(answer) ? 3 : 2) : null,
    structure ? ((answer.match(/首先|然后|最后|因为|所以/g) || []).length >= 2 ? 3 : 2) : null];
  const scores = DIMENSIONS.map((dimension, i) => {
    const rubricId = `rubric.${i + 1}.${RULE_VERSION}`;
    // A missing source is uncertainty, not a fabricated zero or a guessed score.
    const span = sourceSpans[i];
    const evidence = span && requirement ? { ...span, id: `answer.${i + 1}`, requirementId: requirement.id, knowledgeId: 'knowledge.rubric', rubricId } : null;
    return { dimension, score: evidence ? levels[i] : null, max: 5,
      status: evidence ? 'supported' : 'insufficient_evidence', evidence, requirement,
      rubric: { id: rubricId, title: `${dimension}训练量表`, text: RUBRIC_TEXT[dimension], source: KNOWLEDGE_BASE['knowledge.rubric'].title },
      note: evidence ? '仅依据可观察线索给出保守训练评分，需结合追问复核。' : '证据不足，不计算该维度分数。' };
  });
  const slots = { 背景: background, 技术方案: technical, 个人贡献: contribution, 量化结果: quant, 故障兜底: fallback };
  const missing = GAP_NAMES.filter(g => !slots[g]);
  const claims = sentences(resume).filter(s => /负责|独立|主导/.test(s.quote));
  const consistency = !contribution && claims.length ? [{
    type: '待澄清', claim: claims[0], answer: parts[0],
    reason: '简历存在职责主张，但本次回答尚未说明个人动作。不能据此判断造假或前后矛盾。',
  }] : [];
  const priority = consistency.length ? ['个人贡献', '故障兜底', '技术方案', '量化结果', '背景'] : ['故障兜底', '技术方案', '个人贡献', '量化结果', '背景'];
  const asked = input.asked || [], nextGap = priority.find(g => missing.includes(g) && !asked.includes(g));
  const assessed = scores.filter(s => s.score != null);
  const report = {
    mode: 'rules', version: RULE_VERSION, schemaVersion: SCHEMA_VERSION, createdAt: now.toISOString(),
    input: { jd, resume, answer, question: input.question || '', skill }, scores,
    // Total is deliberately withheld while any dimension lacks evidence.
    score: assessed.length === DIMENSIONS.length ? Math.round(assessed.reduce((n, s) => n + s.score, 0) / 25 * 100) : null,
    coverage: Math.round(assessed.length / DIMENSIONS.length * 100),
    evidence: assessed.map(s => s.evidence), missing, consistency, knowledge: KNOWLEDGE_BASE['knowledge.interview-evidence'], knowledgeSources: [KNOWLEDGE_BASE['knowledge.interview-evidence'], KNOWLEDGE_BASE['knowledge.interview-star'], KNOWLEDGE_BASE['knowledge.interview-clarification'], ...(skill === 'redis' ? [KNOWLEDGE_BASE['knowledge.redis-cache-aside']] : skill === 'database' ? [KNOWLEDGE_BASE['knowledge.mysql-indexes']] : [])],
    followUp: nextGap && asked.length < 2 ? { gap: nextGap, question: GAP_QUESTIONS[nextGap] } : null,
    followUpReason: asked.length >= 2 ? '已达到每道主问题最多两轮追问。' : !nextGap ? '本轮没有新的待补充槽位。' : '',
    warning: '规则模式仅识别文本线索，不验证经历真伪、技术正确性或招聘胜任力。',
  };
  return report;
}
export function trainingFor(report) {
  if (!report) return [];
  return report.missing.map((gap, i) => ({ id: `${report.createdAt}:${gap}`, gap, title: GAP_QUESTIONS[gap],
    tasks: [
      { id: `${gap}.1`, title: `复盘：定位本次回答的「${gap}」缺口`, prompt: `回看原回答，为「${gap}」写出三个待澄清点。` },
      { id: `${gap}.2`, title: `练习：${GAP_QUESTIONS[gap]}`, prompt: GAP_QUESTIONS[gap] },
      { id: `${gap}.3`, title: '迁移：换一个项目场景，再回答一次', prompt: `换一个与岗位相关的场景，重新回答「${gap}」，不要照抄原回答。` },
    ], index: i + 1,
    criterion: gap === '量化结果' ? '给出真实数字、单位、前后对比和测量方法；不知道的指标如实说明。' : `补充具体${gap}证据，说明执行过程与边界；仍不确定的部分明确标注。`,
    sourceAnswer: report.input.answer,
  }));
}
export function dueAfterTwoDays(date = new Date()) { const due = new Date(date); due.setDate(due.getDate() + 2); return due.toISOString(); }
