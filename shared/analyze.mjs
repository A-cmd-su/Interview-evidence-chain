// Data contracts for online model output. This module never generates a score.
import {
  DEFAULT_DIFFICULTY,
  difficultyProfile,
  difficultySnapshot,
} from "./difficulty.mjs";
import {
  BRIEFING_VERSION,
  SENIORITIES,
  INTERVIEW_FOCI,
  INTERVIEW_MODES,
  INTERVIEW_LANGUAGES,
  DURATIONS,
} from "./interviewSetup.mjs";
import { validateResumeReview } from "./resume.mjs";
import {
  FLOW_VERSION,
  followDecision,
  coveragePlan,
  similarQuestion,
} from "./flow.mjs";
export const SCHEMA_VERSION = "evidence-loop-3.0";
export const REVIEW_VERSION = "evidence-review-1.2";
export const DIMENSIONS = [
  "相关性",
  "技术深度",
  "个人贡献",
  "量化结果",
  "表达结构",
];
export const GAPS = ["背景", "技术方案", "个人贡献", "量化结果", "故障兜底"];
export const KNOWLEDGE = Object.fromEntries(
  [
    [
      "relevance",
      "相关性",
      "回答是否回应当前问题，并关联岗位要求。1：主题相关；2：回应部分问题；3：联系实际场景；4：覆盖关键要求；5：给出明确边界与取舍。",
    ],
    [
      "depth",
      "技术深度",
      "评价技术或业务方案的专业深度。1：提及概念；2：给出方法；3：解释过程；4：说明取舍与验证；5：覆盖边界和失败条件。",
    ],
    [
      "ownership",
      "个人贡献",
      "区分团队成果和个人行动。1：职责含糊；2：给出本人动作；3：说明职责边界；4：有本人决策与验证；5：清楚说明协作与可归因结果。",
    ],
    [
      "results",
      "量化结果",
      "结果证据应有真实口径。1：只有结果方向；2：数字和单位；3：前后对比；4：测量方法及周期；5：交代归因和不确定性。",
    ],
    [
      "structure",
      "表达结构",
      "借助 STAR 检查情境、任务、行动、结果。1：零散；2：有顺序；3：主要环节清楚；4：逻辑完整；5：重点清晰、边界明确。",
    ],
  ].map(([key, dimension, text]) => [
    `rubric.${key}.v1`,
    {
      id: `rubric.${key}.v1`,
      dimension,
      title: `${dimension}训练量表`,
      text,
      source: "项目自建面试训练量表 v1；非官方认证或招聘标准",
    },
  ]),
);
export class InputError extends Error {}
export class OutputError extends Error {}
function str(value, label, max = 2000, ErrorType = OutputError) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ErrorType(`${label}应为 1–${max} 字符的文本`);
  return value;
}
function list(value, label, max, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new OutputError(`模型的${label}数量应为 ${min}–${max}`);
  return value;
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OutputError("模型结果必须是 JSON 对象");
  return value;
}
export function validateContext(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new InputError("请提交岗位与简历内容");
  if (input.mode && input.mode !== "online")
    throw new InputError("仅支持在线模型请求");
  str(input.jd, "岗位 JD", 20000, InputError);
  str(input.resume, "简历", 20000, InputError);
  const difficulty =
    input.difficulty === undefined ? DEFAULT_DIFFICULTY : input.difficulty;
  if (!difficultyProfile(difficulty))
    throw new InputError("面试难度只能为基础、标准或进阶");
  const interviewMode = input.interviewMode || "text";
  const language = input.language || "zh-CN";
  if (!INTERVIEW_MODES.some((item) => item.id === interviewMode))
    throw new InputError("面试模式无效，请重新选择");
  if (!INTERVIEW_LANGUAGES.some((item) => item.id === language))
    throw new InputError("面试语言无效，请重新选择");
  return {
    jd: input.jd,
    resume: input.resume,
    difficulty,
    interviewMode,
    language,
    ...(input.flowVersion === FLOW_VERSION
      ? { flowVersion: FLOW_VERSION }
      : {}),
    ...(input.resumeReview
      ? {
          resumeReview: (() => {
            try {
              return validateResumeReview(input.resumeReview, input.resume);
            } catch (e) {
              throw new InputError(e.message);
            }
          })(),
        }
      : {}),
    ...(input.briefing !== undefined
      ? { briefing: validateBriefing(input.briefing, input.jd) }
      : {}),
  };
}
export function validateBriefing(value, jd) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.confirmed !== true ||
    value.version !== BRIEFING_VERSION
  )
    throw new InputError("请先校对并确认面试设置，再生成问题");
  const title = str(value.title, "岗位标题", 100, InputError);
  if (
    !SENIORITIES.some((item) => item.id === value.seniority) ||
    !INTERVIEW_FOCI.some((item) => item.id === value.focus)
  )
    throw new InputError("资历或面试侧重点无效，请重新选择");
  const duration = DURATIONS.find(
    (item) => item.minutes === value.durationMinutes,
  );
  if (!duration) throw new InputError("预计时长请选择15、30、45或60分钟");
  const interviewMode = value.interviewMode || "text";
  const language = value.language || "zh-CN";
  if (!INTERVIEW_MODES.some((item) => item.id === interviewMode))
    throw new InputError("面试模式无效，请重新选择");
  if (!INTERVIEW_LANGUAGES.some((item) => item.id === language))
    throw new InputError("面试语言无效，请重新选择");
  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.length < 1 ||
    value.capabilities.length > 10
  )
    throw new InputError("请保留1–10个岗位能力标签");
  const capabilities = value.capabilities.map((c, i) => {
    const label = str(c?.label, "能力标签", 80, InputError);
    const quote = str(c?.quote, "JD依据", 20000, InputError);
    try {
      return {
        id: `jd.${i + 1}`,
        label,
        importance: [1, 2, 3].includes(c.importance) ? c.importance : 2,
        ...exactSpan(jd, quote),
      };
    } catch {
      throw new InputError(
        `能力“${label}”的依据不在JD原文中，请重新选择连续原文`,
      );
    }
  });
  if (
    new Set(capabilities.map((c) => c.label.trim())).size !==
    capabilities.length
  )
    throw new InputError("能力标签不能重名，请合并重复项");
  return {
    version: BRIEFING_VERSION,
    confirmed: true,
    title,
    capabilities,
    seniority: value.seniority,
    focus: value.focus,
    durationMinutes: duration.minutes,
    questionCount: duration.questions,
    interviewMode,
    language,
  };
}
export function validatePreparation(input) {
  const context = validateContext(input);
  if (!context.briefing)
    throw new InputError("请先校对并确认面试设置，再生成问题");
  if (context.flowVersion === FLOW_VERSION && !context.resumeReview)
    throw new InputError("请先确认简历结构化校对");
  return context;
}
export function validateAnswer(input) {
  const context = validateContext(input);
  str(input.answer, "回答", 8000, InputError);
  str(input.question, "当前问题", 2000, InputError);
  const history = input.history ?? [];
  if (!Array.isArray(history) || history.length > (context.flowVersion ? 8 : 2))
    throw new InputError("每道主问题最多两次追问");
  history.forEach((turn) => {
    str(turn?.question, "历史问题", 2000, InputError);
    str(turn?.answer, "历史回答", 8000, InputError);
  });
  return {
    ...context,
    ...(context.flowVersion
      ? {
          remainingSeconds: Number.isFinite(input.remainingSeconds)
            ? Math.max(0, Math.min(3600, input.remainingSeconds))
            : 3600,
        }
      : {}),
    question: input.question,
    answer: input.answer,
    history: history.map(({ question, answer }) => ({ question, answer })),
  };
}
function json(raw) {
  try {
    return object(
      JSON.parse(
        raw
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, ""),
      ),
    );
  } catch {
    throw new OutputError(
      "模型没有返回有效的 JSON 对象，请重试或检查模型的结构化输出能力",
    );
  }
}
export function exactSpan(text, quote) {
  str(quote, "原文引用", 20000);
  const start = text.indexOf(quote);
  if (start < 0) throw new OutputError("模型引用不在原文中，已拒绝此结果");
  return { quote, start, end: start + quote.length };
}
export function parseBriefing(raw, context) {
  const output = json(raw);
  const capabilities = list(output.capabilities, "岗位能力", 10, 1).map(
    (c, i) => ({
      id: `jd.${i + 1}`,
      label: str(c?.label, "能力标签", 80),
      ...exactSpan(context.jd, c.requirementQuote),
    }),
  );
  if (
    new Set(capabilities.map((c) => c.label.trim())).size !==
    capabilities.length
  )
    throw new OutputError("模型返回了重复能力标签，请重试提取");
  if (!SENIORITIES.some((item) => item.id === output.seniority))
    throw new OutputError("模型返回了未知资历类型");
  const seniorityEvidence = output.seniorityQuote
    ? exactSpan(context.jd, output.seniorityQuote)
    : null;
  if (output.seniority !== "unspecified" && !seniorityEvidence)
    throw new OutputError("模型推断资历但未提供JD原文依据");
  return {
    version: BRIEFING_VERSION,
    confirmed: false,
    title: str(output.title, "岗位标题", 100),
    capabilities,
    seniority: output.seniority,
    seniorityEvidence,
    focus: "balanced",
    durationMinutes: 30,
    interviewMode: "text",
    language: "zh-CN",
  };
}
export function parseQuestions(raw, context) {
  const output = json(raw);
  const briefing = context.briefing
    ? validateBriefing(context.briefing, context.jd)
    : null;
  const capabilities =
    briefing?.capabilities ||
    list(output.capabilities, "岗位能力", 10, 1).map((c, i) => ({
      id: `jd.${i + 1}`,
      label: str(c?.label, "能力标签", 80),
      ...exactSpan(context.jd, c.requirementQuote),
    }));
  if (briefing && output.questions?.length !== briefing.questionCount)
    throw new OutputError(
      `本轮设置需要${briefing.questionCount}道主问题，模型返回数量不符`,
    );
  const questions = list(output.questions, "面试问题", 8, 3).map((q, i) => {
    const capability = capabilities.find((c) => c.id === q.requirementId);
    if (!capability) throw new OutputError("问题未关联有效岗位能力 ID");
    return {
      id: `q.${i + 1}`,
      skill: capability.label,
      requirement: capability,
      question: str(q.question, "问题"),
      why: str(q.why, "提问原因", 500),
    };
  });
  if (context.flowVersion) {
    const plan = coveragePlan(briefing);
    for (let i = 0; i < questions.length; i++) {
      if (questions[i].requirement.id !== plan[i].requirementId)
        throw new OutputError("模型未遵循岗位覆盖规划，请重新生成");
      if (
        questions
          .slice(0, i)
          .some((q) => similarQuestion(q.question, questions[i].question))
      )
        throw new OutputError("模型生成了相似重复问题，请重新生成");
    }
  }
  const difficulty = validateContext(context).difficulty;
  return {
    title: briefing?.title || str(output.title, "岗位标题", 100),
    ...(briefing ? { briefing } : {}),
    capabilities,
    questions,
    difficulty,
    difficultyPolicy: difficultySnapshot(difficulty),
  };
}
export function parseAnalysis(raw, input, now = new Date()) {
  input = validateAnswer(input);
  const output = json(raw);
  const rows = list(output.scores, "评分维度", 5, 5);
  if (
    new Set(rows.map((r) => r?.dimension)).size !== 5 ||
    rows.some((r) => !DIMENSIONS.includes(r?.dimension))
  )
    throw new OutputError("模型必须返回五个不同的评分维度");
  const turns = [
    ...(input.history || []),
    { question: input.question, answer: input.answer },
  ];
  const scores = DIMENSIONS.map((dimension, index) => {
    const row = rows.find((r) => r.dimension === dimension);
    if (
      row.score !== null &&
      (!Number.isInteger(row.score) || row.score < 0 || row.score > 5)
    )
      throw new OutputError("模型分数必须为 0–5 整数或 null");
    const rubric = KNOWLEDGE[row.knowledgeId];
    const note = str(row.note, "评分解释", 1200);
    const answerTurn = row.answerTurn ?? turns.length - 1;
    if (!Number.isInteger(answerTurn) || !turns[answerTurn])
      throw new OutputError("模型引用了不存在的回答轮次");
    const answer = row.answerQuote
      ? exactSpan(turns[answerTurn].answer, row.answerQuote)
      : null;
    const requirement = row.requirementQuote
      ? exactSpan(input.jd, row.requirementQuote)
      : null;
    const confirmedCapability =
      requirement &&
      input.briefing?.capabilities.find(
        (c) => requirement.start >= c.start && requirement.end <= c.end,
      );
    const supported =
      answer &&
      requirement &&
      rubric?.dimension === dimension &&
      (!input.briefing || confirmedCapability) &&
      row.score !== null;
    return {
      dimension,
      score: null,
      proposedScore: supported ? row.score : null,
      status: supported ? "pending_review" : "insufficient_evidence",
      evidenceIssue:
        requirement && input.briefing && !confirmedCapability
          ? "unconfirmed_requirement"
          : null,
      note,
      rubric: Object.values(KNOWLEDGE).find((k) => k.dimension === dimension),
      evidence: supported
        ? {
            id: `evidence.${index + 1}`,
            answer: { ...answer, turn: answerTurn },
            requirement: {
              ...requirement,
              id:
                confirmedCapability?.id ||
                `jd.${requirement.start}.${requirement.end}`,
            },
            knowledgeId: rubric.id,
          }
        : null,
    };
  });
  const missing = [...new Set(list(output.missing, "缺口", 5))];
  if (missing.some((g) => !GAPS.includes(g)))
    throw new OutputError("模型返回了未知的缺口类型");
  let followUp = null;
  if (output.followUp && turns.length < (input.flowVersion ? 9 : 3)) {
    if (!missing.includes(output.followUp.gap))
      throw new OutputError("追问必须对应本轮缺口");
    followUp = {
      gap: output.followUp.gap,
      question: str(output.followUp.question, "追问", 1000),
    };
  }
  if (missing.length && turns.length < 3 && !followUp && !input.flowVersion)
    throw new OutputError("模型未针对缺口生成追问");
  const consistency = list(output.consistency, "待澄清项", 6).map((c) => {
    const source = c?.source;
    if (!["resume", "history"].includes(source))
      throw new OutputError("待澄清项来源不正确");
    const prior =
      source === "resume" ? input.resume : input.history?.[c.turn]?.answer;
    if (!prior) throw new OutputError("待澄清项引用了不存在的历史回答");
    if (
      source === "resume" &&
      input.resumeReview &&
      !input.resumeReview.items.some((item) =>
        item.quote.includes(c.claimQuote),
      )
    )
      throw new OutputError("待澄清项引用了未经用户确认的简历内容");
    return {
      type: "待澄清",
      source,
      turn: source === "resume" ? null : c.turn,
      claim: exactSpan(prior, c.claimQuote),
      answer: exactSpan(input.answer, c.answerQuote),
      reason: str(c.reason, "澄清原因", 1000),
      question: str(c.question, "澄清问题", 1000),
    };
  });
  const plan = object(output.trainingPlan);
  const tasks = list(plan.tasks, "训练题", 6, missing.length ? 3 : 0).map(
    (t, i) => {
      if (!missing.includes(t.gap))
        throw new OutputError("训练任务未关联本轮缺口");
      return {
        id: `task.${i + 1}`,
        gap: t.gap,
        title: str(t.title, "任务标题", 150),
        prompt: str(t.prompt, "练习问题", 1200),
        criterion: str(t.criterion, "完成标准", 1000),
      };
    },
  );
  const due = new Date(now);
  due.setDate(due.getDate() + 2);
  const decision = input.flowVersion
    ? followDecision({
        missing,
        question: followUp?.question,
        history: turns,
        remainingSeconds: input.remainingSeconds,
      })
    : null;
  if (decision && !decision.continue) followUp = null;
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    mode: "online-model",
    input,
    difficultyPolicy: difficultySnapshot(input.difficulty),
    scores,
    score: null,
    coverage: 0,
    missing,
    consistency,
    followUp,
    followUpReason:
      decision?.reason ||
      (turns.length >= 3
        ? "本题两轮追问已完成，可转入专项训练。"
        : "本题暂无新增缺口。"),
    trainingPlan: {
      title: str(plan.title, "计划标题", 150),
      reason: str(plan.reason, "计划原因", 1000),
      dueAt: due.toISOString(),
      tasks,
    },
    knowledge: KNOWLEDGE["rubric.structure.v1"],
    knowledgeSources: Object.values(KNOWLEDGE),
  };
}

// A draft is internal only. No proposed score survives the publication boundary.
export function applySemanticReview(raw, draft, now = new Date()) {
  const candidates = draft.scores.filter(
    (row) => row.status === "pending_review",
  );
  const rows = list(
    json(raw).reviews,
    "语义复核维度",
    candidates.length,
    candidates.length,
  );
  const reviews = new Map();
  for (const value of rows) {
    const row = object(value);
    const candidate = candidates.find(
      (item) => item.dimension === row.dimension,
    );
    if (!candidate || reviews.has(row.dimension))
      throw new OutputError("语义复核缺少维度、重复维度或包含未知维度");
    if (row.evidenceId !== candidate.evidence.id)
      throw new OutputError("语义复核未关联该维度的原始证据");
    if (!["supported", "unsupported", "uncertain"].includes(row.verdict))
      throw new OutputError("语义复核结论无效");
    if (
      Object.keys(row).some(
        (key) =>
          !["dimension", "evidenceId", "verdict", "reason"].includes(key),
      )
    )
      throw new OutputError("语义复核只能返回结论与理由，不能改写分数或原文");
    reviews.set(row.dimension, {
      evidenceId: row.evidenceId,
      verdict: row.verdict,
      reason: str(row.reason, "语义复核理由", 800),
    });
  }
  const scores = draft.scores.map(({ proposedScore, ...row }) => {
    const review = reviews.get(row.dimension);
    if (!review)
      return {
        ...row,
        note:
          row.evidenceIssue === "unconfirmed_requirement"
            ? "引用的岗位要求不在本次确认的能力范围内，不发布分数。"
            : "缺少完整的回答、岗位或量表依据，不发布分数。",
        review: null,
      };
    return {
      ...row,
      score: review.verdict === "supported" ? proposedScore : null,
      status:
        review.verdict === "supported"
          ? "supported"
          : `semantic_${review.verdict}`,
      note: review.reason,
      review,
    };
  });
  const supported = scores.filter(isReviewedScore);
  return {
    ...draft,
    scores,
    score:
      supported.length === 5
        ? supported.reduce((sum, row) => sum + row.score, 0) * 4
        : null,
    coverage: supported.length * 20,
    semanticReview: {
      version: REVIEW_VERSION,
      status: candidates.length ? "completed" : "not_required",
      reviewedAt: candidates.length ? now.toISOString() : null,
      reviewedCount: candidates.length,
      supportedCount: supported.length,
    },
  };
}

export function isReviewedScore(row) {
  return (
    row.status === "supported" &&
    row.review?.verdict === "supported" &&
    Boolean(row.evidence?.id) &&
    row.review.evidenceId === row.evidence.id &&
    Number.isInteger(row.score) &&
    row.score >= 0 &&
    row.score <= 5
  );
}
