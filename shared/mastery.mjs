import { isReviewedScore } from "./analyze.mjs";
import { similarQuestion } from "./flow.mjs";
const DAY = 86400000;
const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
export function masteryConditions(r) {
  return JSON.stringify([
    r.input.jd,
    r.input.resume,
    r.input.difficulty,
    r.input.interviewMode,
    r.input.language,
    r.input.languageSettings || null,
    r.input.briefing || null,
    r.difficultyPolicy || null,
    r.model,
    r.provider,
    r.schemaVersion,
    r.evaluation || null,
    r.semanticReview?.version,
    r.semanticReview?.model,
    r.semanticReview?.endpoint,
    r.scores
      .map((s) => [s.dimension, s.rubric?.id, s.rubric?.text])
      .sort((a, b) => a[0].localeCompare(b[0])),
  ]);
}
export function masteryStatus(
  original,
  records,
  task,
  done = false,
  now = Date.now(),
) {
  const baseline = masteryConditions(original);
  const criterion = task?.criterion;
  const related = records
    .filter(
      (r) =>
        r.originReportId === original.id &&
        (!task ||
          r.practiceTaskId === task.id ||
          (!r.practiceTaskId && r.practiceCriterion?.includes(criterion))),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const valid = [],
    rejected = [];
  const answers = new Set([normalize(original.input.answer)]),
    questions = [original.input.question];
  let nextDue = Date.parse(original.createdAt) + 2 * DAY,
    lastFailed = false,
    modelSegment = null;
  for (const r of related) {
    let reason = "";
    const v = r.trainingVerification;
    const verificationModel = JSON.stringify([
      v?.model,
      v?.endpoint,
      v?.version,
    ]);
    if (masteryConditions(r) !== baseline)
      reason = "模型、资料、语言或量表条件改变，独立分段";
    else if (r.practiceKind !== "equivalent" || !r.equivalence?.confirmed)
      reason = "同题或未确认的场景，仅记练习";
    else if (
      !v?.passed ||
      r.scores.length !== 5 ||
      !r.scores.every(isReviewedScore) ||
      r.missing.length
    ) {
      reason = "本次新回答仍有缺口或证据未通过";
      valid.length = 0;
      modelSegment = null;
      lastFailed = true;
      nextDue = Date.parse(r.createdAt) + 2 * DAY;
    } else if (
      !v.quote ||
      r.input.answer.slice(v.start, v.start + v.quote.length) !== v.quote
    )
      reason = "缺少有效的新回答核验引用";
    else if (
      answers.has(normalize(r.input.answer)) ||
      questions.some((q) => similarQuestion(q, r.input.question))
    )
      reason = "回答或场景重复，不累计掌握次数";
    else if (modelSegment && verificationModel !== modelSegment)
      reason = "掌握度核验模型改变，需同条件重新验证";
    else if (valid.length && Date.parse(r.createdAt) < nextDue)
      reason = "本次通过但未到间隔复测日期，仅记提前练习";
    if (reason) {
      rejected.push({ report: r, reason });
      continue;
    }
    modelSegment = verificationModel;
    valid.push(r);
    answers.add(normalize(r.input.answer));
    questions.push(r.input.question);
    lastFailed = false;
    nextDue = Date.parse(r.createdAt) + (valid.length === 1 ? 7 : 30) * DAY;
  }
  const state = lastFailed
    ? "failed"
    : now >= nextDue
      ? "due"
      : valid.length >= 2
        ? "stable"
        : valid.length === 1
          ? "verified"
          : done || related.length
            ? "practiced"
            : "unstarted";
  return {
    state,
    label: {
      failed: "复测未通过",
      due: "待复测",
      stable: "稳定掌握",
      verified: "新证据已验证",
      practiced: "已练习，未验证掌握",
      unstarted: "未开始",
    }[state],
    passes: valid.length,
    nextDue: new Date(nextDue).toISOString(),
    valid,
    rejected,
  };
}
