import { GAPS, isReviewedScore } from "../shared/analyze.mjs";
import { sessionSnapshot } from "./state.js";

export function availableSessions(workspace) {
  const sessions = new Map();
  if (workspace.session)
    sessions.set(workspace.session.id, sessionSnapshot(workspace.session));
  for (const session of workspace.sessions || []) {
    if (!sessions.has(session.id)) sessions.set(session.id, session);
  }
  // Older reports lack unasked questions; do not infer a complete interview path.
  const legacy = new Map();
  for (const report of workspace.records) {
    if (!report.sessionId || sessions.has(report.sessionId)) continue;
    if (!legacy.has(report.sessionId))
      legacy.set(report.sessionId, {
        id: report.sessionId,
        title: "历史面试记录",
        jd: report.input.jd,
        resume: report.input.resume,
        createdAt: report.createdAt,
        capabilities: [],
        questions: [],
        pathComplete: false,
      });
    const session = legacy.get(report.sessionId);
    if (!session.questions.some((q) => q.id === report.questionId))
      session.questions.push({
        id: report.questionId,
        question: report.input.history?.[0]?.question || report.input.question,
        requirement: report.questionRequirement,
      });
  }
  return [...sessions.values(), ...legacy.values()];
}

export function summarizeSession(session, records) {
  const latest = new Map();
  // Records are newest first. A later insufficient result must not reveal an older score.
  for (const record of records) {
    if (record.sessionId === session.id && !latest.has(record.questionId))
      latest.set(record.questionId, record);
  }
  const questions = session.questions.map((question) => ({
    ...question,
    report: latest.get(question.id) || null,
  }));
  const reports = questions.flatMap((q) => (q.report ? [q.report] : []));
  const capabilities = session.capabilities.map((capability) => {
    const assessed = questions.filter(
      (q) => q.requirement?.id === capability.id && q.report,
    );
    const supported = assessed.filter((q) =>
      q.report.scores.some((score) => {
        const span = score.evidence?.requirement;
        return (
          isReviewedScore(score) &&
          span &&
          span.start < capability.end &&
          span.end > capability.start
        );
      }),
    );
    return {
      ...capability,
      status: supported.length
        ? "assessed"
        : assessed.length
          ? assessed.some((q) => !q.report.semanticReview)
            ? "unreviewed"
            : "insufficient"
          : "unassessed",
      reports: assessed.map((q) => q.report),
    };
  });
  const gaps = GAPS.map((gap) => ({
    gap,
    reports: reports.filter((report) => report.missing.includes(gap)),
  }))
    .filter((item) => item.reports.length)
    .sort((a, b) => b.reports.length - a.reports.length);
  const tasks = [];
  const seen = new Set();
  for (const item of gaps) {
    for (const report of item.reports) {
      for (const task of report.trainingPlan.tasks.filter(
        (task) => task.gap === item.gap,
      )) {
        const key = task.gap + "\u0000" + task.prompt.trim();
        if (seen.has(key)) continue;
        seen.add(key);
        tasks.push({ task, report });
      }
    }
  }
  return {
    questions,
    capabilities,
    gaps,
    priorities: gaps.slice(0, 3).map((item) => ({
      ...item,
      task: tasks.find((entry) => entry.task.gap === item.gap) || null,
    })),
    tasks,
    evaluated: reports.length,
    total: questions.length,
    clarifications: reports.flatMap((report) =>
      report.consistency.map((item) => ({ item, report })),
    ),
  };
}

export function compareReports(report, previous) {
  if (!previous) return null;
  const observed = {
    noLongerReported: previous.missing.filter(
      (gap) => !report.missing.includes(gap),
    ),
    stillReported: previous.missing.filter((gap) =>
      report.missing.includes(gap),
    ),
  };
  const result = (reason) => ({ ...observed, comparable: !reason, reason });
  if (report.practiceKind === "targeted")
    return result("专项练习与原题不同，不比较总分");
  if (report.practiceKind !== "retest")
    return result("缺少复测类型记录，不比较总分");
  if (
    report.input.jd !== previous.input.jd ||
    report.input.resume !== previous.input.resume
  )
    return result("岗位或简历资料发生变化，不比较总分");
  const questions = (r) =>
    [...(r.input.history || []), r.input].map((turn) => turn.question);
  if (JSON.stringify(questions(report)) !== JSON.stringify(questions(previous)))
    return result("主问题或追问条件不同，不比较总分");
  if (!report.evaluation?.promptVersion || !previous.evaluation?.promptVersion)
    return result("缺少评估版本记录，不比较总分");
  if (!report.semanticReview || !previous.semanticReview)
    return result("历史评分未经语义复核，不比较总分");
  const settings = (r) => [
    r.model,
    r.provider,
    r.schemaVersion,
    r.evaluation.promptVersion,
    r.evaluation.reviewVersion,
    r.semanticReview.version,
    r.semanticReview.model,
    r.semanticReview.endpoint,
    r.semanticReview.protocol,
    r.evaluation.endpoint,
    r.evaluation.protocol,
    r.evaluation.tokenField,
    r.evaluation.maxOutputTokens,
    r.evaluation.jsonMode,
    [...r.scores]
      .sort((a, b) => a.dimension.localeCompare(b.dimension))
      .map((s) => [s.dimension, s.rubric.id, s.rubric.text]),
  ];
  if (JSON.stringify(settings(report)) !== JSON.stringify(settings(previous)))
    return result("模型、量表或评估配置不同，不比较总分");
  if (
    report.score === null ||
    previous.score === null ||
    !report.scores.every(isReviewedScore) ||
    !previous.scores.every(isReviewedScore)
  )
    return result("存在证据不足的维度，不比较总分");
  return result(null);
}

export function exportSessionSummary(session, summary, done = {}) {
  return {
    type: "session-summary-v1",
    session,
    evaluated: summary.evaluated,
    total: summary.total,
    reports: summary.questions.flatMap((q) => (q.report ? [q.report] : [])),
    questions: summary.questions.map(({ report, ...question }) => ({
      ...question,
      reportId: report?.id || null,
    })),
    capabilities: summary.capabilities.map(({ reports, ...capability }) => ({
      ...capability,
      reportIds: reports.map((r) => r.id),
    })),
    gaps: summary.gaps.map(({ gap, reports }) => ({
      gap,
      reportIds: reports.map((r) => r.id),
    })),
    priorities: summary.priorities.map(({ gap }) => gap),
    tasks: summary.tasks.map(({ task, report }) => ({
      ...task,
      reportId: report.id,
      completed: Boolean(done[report.id + ":" + task.id]),
    })),
    clarifications: summary.clarifications.map(({ item, report }) => ({
      ...item,
      reportId: report.id,
    })),
  };
}
