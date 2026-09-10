export const STORAGE_KEY = "evidence-loop.workspace.v2";
export const initialWorkspace = () => ({
  version: 2,
  draft: { jd: "", resume: "" },
  session: null,
  sessions: [],
  records: [],
  selected: null,
  done: {},
});
export function loadWorkspace(storage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (
      value?.version === 2 &&
      typeof value.draft?.jd === "string" &&
      typeof value.draft?.resume === "string" &&
      Array.isArray(value.records) &&
      value.done &&
      typeof value.done === "object"
    )
      return {
        ...value,
        sessions: Array.isArray(value.sessions) ? value.sessions : [],
      };
  } catch {
    /* Corrupt or unavailable tab storage starts a clean workspace. */
  }
  return initialWorkspace();
}
export function questionState(question) {
  return {
    ...question,
    draft: "",
    prompt: question.question,
    ready: true,
    attempts: [],
  };
}
export function sessionSnapshot(session) {
  return {
    id: session.id,
    title: session.title,
    jd: session.jd,
    resume: session.resume,
    createdAt: session.createdAt || null,
    capabilities: session.capabilities || [],
    pathComplete: true,
    questions: session.questions.map(
      ({ id, question, skill, requirement }) => ({
        id,
        question,
        skill,
        requirement,
      }),
    ),
  };
}
export function beginSession(workspace, session) {
  const sessions = workspace.sessions || [];
  return {
    ...workspace,
    sessions: workspace.session
      ? [
          sessionSnapshot(workspace.session),
          ...sessions.filter((s) => s.id !== workspace.session.id),
        ]
      : sessions,
    session,
  };
}
export function followQuestion(question, report) {
  if (question.ready || !report?.followUp || question.attempts.length >= 3)
    return question;
  return {
    ...question,
    ready: true,
    prompt: report.followUp.question,
    draft: "",
  };
}
export function acceptAnswer(workspace, report, id) {
  const q = workspace.session.questions[workspace.session.current];
  const record = {
    ...report,
    id,
    sessionId: workspace.session.id,
    questionId: q.id,
    originReportId: workspace.session.originReportId || null,
    practiceKind: workspace.session.practiceKind || null,
    practiceGap: workspace.session.practiceGap || null,
    questionRequirement: q.requirement || null,
  };
  const updated = {
    ...q,
    ready: false,
    draft: "",
    attempts: [
      ...q.attempts,
      {
        question: report.input.question,
        answer: report.input.answer,
        reportId: id,
      },
    ],
  };
  return {
    ...workspace,
    selected: id,
    records: [record, ...workspace.records],
    session: {
      ...workspace.session,
      questions: workspace.session.questions.map((x) =>
        x.id === q.id ? updated : x,
      ),
    },
  };
}
