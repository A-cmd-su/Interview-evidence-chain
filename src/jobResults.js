import { beginSession, questionState, acceptAnswer } from "./state.js";
import { difficultySnapshot } from "../shared/difficulty.mjs";
export function applyJobResult(w, pending, result) {
  if (w.appliedJobs?.includes(pending.id)) return { ...w, pending: null };
  let next = {
    ...w,
    pending: null,
    appliedJobs: [...(w.appliedJobs || []).slice(-200), pending.id],
  };
  const context = pending.input;
  if (pending.operation === "briefing")
    next.preparation = { source: context, proposal: result, edited: result };
  if (pending.operation === "resume") {
    const segments =
      w.draft.resumeDocument?.text === context.resume
        ? w.draft.resumeDocument.segments
        : [];
    next.draft = {
      ...w.draft,
      resumeReview: {
        ...result,
        items: result.items.map((item) => ({
          ...item,
          page:
            segments.find((s) => s.start <= item.start && s.end > item.start)
              ?.page || null,
        })),
      },
    };
  }
  if (pending.operation === "prepare")
    next = beginSession(
      { ...next, preparation: null },
      {
        id: pending.id,
        createdAt: new Date().toISOString(),
        title: result.title,
        ...context,
        difficulty: result.difficulty,
        difficultyPolicy: result.difficultyPolicy,
        briefing: result.briefing,
        capabilities: result.capabilities,
        questions: result.questions.map(questionState),
        current: 0,
        deadline: Date.now() + context.briefing.durationMinutes * 60000,
      },
    );
  if (pending.operation === "analyze") {
    if (
      w.session?.id !== pending.sessionId ||
      w.session.questions[w.session.current]?.id !== pending.questionId
    )
      throw new Error("任务所属面试已变化，请从任务记录查看原结果");
    next = acceptAnswer(next, result, pending.id);
  }
  if (pending.operation === "equivalent") {
    const original = w.records.find((r) => r.id === pending.originReportId);
    if (!original) throw new Error("原始报告已不存在，无法关联复测");
    next = beginSession(next, {
      id: pending.id,
      createdAt: new Date().toISOString(),
      title: "不同场景复测",
      ...context,
      difficultyPolicy: difficultySnapshot(context.difficulty),
      capabilities: original.questionRequirement
        ? [original.questionRequirement]
        : [],
      questions: [
        questionState({
          id: "q.1",
          question: result.question,
          skill: "等价场景复测",
          why: result.equivalenceReason,
          requirement: original.questionRequirement,
        }),
      ],
      current: 0,
      originReportId: original.id,
      practiceKind: "equivalent",
      practiceCriterion: context.criterion,
      equivalence: {
        originalQuestion: context.question,
        reason: result.equivalenceReason,
        confirmed: false,
      },
    });
  }
  return next;
}
