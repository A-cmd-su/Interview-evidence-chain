import {
  KNOWLEDGE,
  parseAnalysis,
  applySemanticReview,
  validateBriefing,
} from "../shared/analyze.mjs";
import { BRIEFING_VERSION } from "../shared/interviewSetup.mjs";
export const config = {
  baseUrl: "http://127.0.0.1:9999/v1/chat/completions",
  model: "fixture-only",
  apiKey: "",
};
export const context = {
  jd: "产品经理，负责用户增长分析与实验设计，推动跨团队协作并验证业务结果。",
  resume: "主导用户增长项目，负责设计实验并协调销售与研发。",
};
export const input = {
  ...context,
  question: "请介绍一次增长实验，你负责什么，如何验证结果？",
  answer:
    "在新用户注册场景，我负责实验设计并协调研发。转化率从12%提升到15%，按两周同口径AB实验测量。",
  history: [],
};
export function prepared(ctx = context) {
  const result = {
    title: "目标岗位面试",
    capabilities: [{ label: "岗位能力", requirementQuote: ctx.jd }],
    questions: [
      {
        requirementId: "jd.1",
        question: "介绍一个与岗位相关的项目，你负责哪些部分？",
        why: "澄清职责边界",
      },
      {
        requirementId: "jd.1",
        question: "如何选择方案，并验证实际结果？",
        why: "评估方法与结果",
      },
      {
        requirementId: "jd.1",
        question: "请介绍一次跨团队协作遇到的分歧。",
        why: "评估协作与风险处理",
      },
    ],
  };
  if (ctx.briefing)
    return {
      questions: Array.from({ length: ctx.briefing.questionCount }, (_, i) => ({
        ...result.questions[i % 3],
        requirementId:
          ctx.briefing.capabilities[i % ctx.briefing.capabilities.length].id,
        question:
          result.questions[i % 3].question + (i >= 3 ? `（场景${i + 1}）` : ""),
      })),
    };
  return result;
}
export function briefingOutput(ctx = context) {
  return {
    title: "目标岗位面试",
    capabilities: [{ label: "岗位能力", requirementQuote: ctx.jd }],
    seniority: "unspecified",
    seniorityQuote: "",
  };
}
export function confirmedContext(data = input, overrides = {}) {
  return {
    ...data,
    briefing: validateBriefing(
      {
        version: BRIEFING_VERSION,
        confirmed: true,
        title: "目标岗位面试",
        capabilities: [{ label: "岗位能力", quote: data.jd }],
        seniority: "unspecified",
        focus: "balanced",
        durationMinutes: 15,
        ...overrides,
      },
      data.jd,
    ),
  };
}
export function analysis(data = input, gap = "故障兜底") {
  const turns = data.history || [];
  const missing = gap ? [gap] : [];
  return {
    scores: Object.values(KNOWLEDGE).map((r) => ({
      dimension: r.dimension,
      score: 3,
      answerTurn: turns.length,
      answerQuote: data.answer,
      requirementQuote: data.briefing?.capabilities[0].quote || data.jd,
      knowledgeId: r.id,
      note: "回答引用可以定位，仍需验证专业判断与适用范围。",
    })),
    missing,
    followUp:
      gap && turns.length < 2
        ? { gap, question: "如果方案没有达到预期，你会如何止损和恢复？" }
        : null,
    consistency: [],
    trainingPlan: {
      title: "补齐风险应对证据",
      reason: gap ? "当前回答需要补充" + gap + "。" : "本轮信息槽位已覆盖。",
      tasks: gap
        ? [1, 2, 3].map((i) => ({
            gap,
            title: "风险处理练习 " + i,
            prompt: "请结合一个具体项目说明方案失败时的应对措施。",
            criterion: "说清风险信号、本人动作和验证方法。",
          }))
        : [],
    },
  };
}
export const chatResponse = (value) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: typeof value === "string" ? value : JSON.stringify(value),
          },
          finish_reason: "stop",
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
export function semanticReview(data) {
  return {
    reviews: data.candidates.map((row) => ({
      dimension: row.dimension,
      evidenceId: row.evidence.id,
      verdict: "supported",
      reason: "测试复核结果：此处仅验证复核结构与证据关联，不代表模型准确性。",
    })),
  };
}
export function reviewedAnalysis(data = input, gap = "故障兜底") {
  const draft = parseAnalysis(JSON.stringify(analysis(data, gap)), data);
  return applySemanticReview(
    JSON.stringify(semanticReview({ candidates: draft.scores })),
    draft,
  );
}
export async function fixtureFetch(url, options) {
  const messages = JSON.parse(options.body).messages;
  if (messages.length === 1) return chatResponse({ ok: true });
  const data = JSON.parse(messages.at(-1).content);
  return chatResponse(
    messages[0].content.includes("任务=prepare")
      ? prepared(data)
      : messages[0].content.includes("任务=briefing")
        ? briefingOutput(data)
        : messages[0].content.includes("任务=review")
          ? semanticReview(data)
          : analysis(data),
  );
}
