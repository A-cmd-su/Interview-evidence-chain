import {
  DEFAULT_DIFFICULTY,
  difficultyProfile,
} from "../shared/difficulty.mjs";
import { BRIEFING_VERSION } from "../shared/interviewSetup.mjs";
import { followDecision, FLOW_VERSION } from "../shared/flow.mjs";
export const STORAGE_KEY = "evidence-loop.workspace.v2";
export const initialWorkspace = () => ({
  version: 2,
  draft: { jd: "", resume: "", difficulty: DEFAULT_DIFFICULTY },
  preparation: null,
  session: null,
  sessions: [],
  records: [],
  selected: null,
  done: {},
});
export function isPreparationCurrent(preparation, draft) {
  return Boolean(
    preparation?.source &&
    preparation?.proposal?.version === BRIEFING_VERSION &&
    preparation?.edited?.version === BRIEFING_VERSION &&
    Array.isArray(preparation.proposal.capabilities) &&
    Array.isArray(preparation.edited.capabilities) &&
    ["jd", "resume", "difficulty"].every(
      (key) => preparation.source[key] === draft[key],
    ),
  );
}
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
        draft: {
          ...value.draft,
          difficulty: difficultyProfile(value.draft.difficulty)
            ? value.draft.difficulty
            : DEFAULT_DIFFICULTY,
        },
        sessions: Array.isArray(value.sessions) ? value.sessions : [],
        preparation: isPreparationCurrent(value.preparation, value.draft)
          ? value.preparation
          : null,
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
    difficulty: session.difficulty || null,
    difficultyPolicy: session.difficultyPolicy || null,
    briefing: session.briefing || null,
    flowVersion: session.flowVersion || null,
    resumeReview: session.resumeReview || null,
    deadline: session.deadline || null,
    originReportId: session.originReportId || null,
    createdAt: session.createdAt || null,
    capabilities: session.capabilities || [],
    pathComplete: true,
    questions: session.questions.map(
      ({ id, question, skill, requirement, skipped }) => ({
        id,
        question,
        skill,
        requirement,
        skipped: Boolean(skipped),
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
export function followQuestion(question, report, session) {
  const adaptive = session?.flowVersion === FLOW_VERSION;
  const decision = adaptive
    ? followDecision({
        missing: report?.missing || [],
        question: report?.followUp?.question,
        history: question.attempts,
        skipped: question.skipped,
        remainingSeconds: session.deadline
          ? (session.deadline - Date.now()) / 1000
          : Infinity,
      })
    : null;
  if (
    question.ready ||
    !report?.followUp ||
    (!adaptive && question.attempts.length >= 3) ||
    (decision && !decision.continue)
  )
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
    trainingPlan: report.trainingPlan
      ? {
          ...report.trainingPlan,
          tasks: report.trainingPlan.tasks.map((task) => ({
            ...task,
            sourceReportId: id,
            requirementId: q.requirement?.id || null,
            evidenceIds: report.scores.flatMap((row) =>
              row.evidence ? [row.evidence.id] : [],
            ),
          })),
        }
      : report.trainingPlan,
    sessionId: workspace.session.id,
    questionId: q.id,
    originReportId: workspace.session.originReportId || null,
    practiceKind: workspace.session.practiceKind || null,
    practiceGap: workspace.session.practiceGap || null,
    practiceCriterion: workspace.session.practiceCriterion || null,
    equivalence: workspace.session.equivalence || null,
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
