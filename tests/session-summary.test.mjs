import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspace,
  beginSession,
  acceptAnswer,
  questionState,
  loadWorkspace,
  STORAGE_KEY,
} from "../src/state.js";
import {
  availableSessions,
  summarizeSession,
  compareReports,
  exportSessionSummary,
} from "../src/sessionSummary.js";
import { parseQuestions } from "../shared/analyze.mjs";
import { input, reviewedAnalysis, prepared } from "./fixtures.mjs";

function session(id = "session-1") {
  const path = parseQuestions(JSON.stringify(prepared()), input);
  return {
    ...path,
    id,
    jd: input.jd,
    resume: input.resume,
    current: 0,
    questions: path.questions.map(questionState),
  };
}
function report(id, questionId = "q.1", gap = "故障兜底") {
  return {
    ...reviewedAnalysis(input, gap),
    id,
    questionId,
    sessionId: "session-1",
    model: "test-model",
    provider: "https://test.example/v1",
    evaluation: {
      promptVersion: "prompt-1",
      protocol: "chat",
      endpoint: "https://test.example/v1/chat/completions",
      tokenField: "auto",
      maxOutputTokens: 8192,
      jsonMode: false,
    },
  };
}

test("整场复盘保留未回答问题，不生成额外总分", () => {
  const s = session();
  s.capabilities.push({
    id: "jd.2",
    label: "未覆盖能力",
    quote: input.jd,
    start: 0,
    end: input.jd.length,
  });
  const summary = summarizeSession(s, [report("r1")]);
  assert.equal(summary.total, 3);
  assert.equal(summary.evaluated, 1);
  assert.equal(summary.questions[1].report, null);
  assert.equal(summary.capabilities[0].status, "assessed");
  assert.equal(summary.capabilities[1].status, "unassessed");
  assert.equal(summary.score, undefined);
});

test("追问不重复计数，只取每题最新结果并隔离不同面试", () => {
  const first = report("first"),
    latest = report("latest", "q.1", null);
  const otherSession = { ...report("other"), sessionId: "session-2" };
  const summary = summarizeSession(session(), [
    otherSession,
    latest,
    report("second", "q.2"),
    first,
  ]);
  assert.equal(summary.evaluated, 2);
  assert.equal(summary.questions[0].report.id, "latest");
  assert.equal(summary.gaps[0].reports.length, 1);
  assert.equal(summary.gaps[0].reports[0].id, "second");
});

test("新报告缺证时不会回退到旧分数或旧证据", () => {
  const latest = report("latest");
  latest.score = null;
  latest.scores = latest.scores.map((s) => ({
    ...s,
    status: "insufficient_evidence",
    score: null,
    evidence: null,
  }));
  const summary = summarizeSession(session(), [latest, report("old")]);
  assert.equal(summary.questions[0].report.score, null);
  assert.equal(summary.capabilities[0].status, "insufficient");
});

test("有分数但引用不覆盖关联能力时仍待补证", () => {
  const latest = report("latest");
  latest.scores.forEach((row) => {
    row.evidence.requirement = { start: 1000, end: 1001 };
  });
  assert.equal(
    summarizeSession(session(), [latest]).capabilities[0].status,
    "insufficient",
  );
});

test("训练优先级按受影响主问题数排列，重复题去重且保留来源", () => {
  const s = session();
  const r1 = report("r1"),
    r2 = report("r2", "q.2"),
    r3 = report("r3", "q.3", "背景");
  const summary = summarizeSession(s, [r3, r2, r1]);
  assert.deepEqual(
    summary.priorities.map((p) => [p.gap, p.reports.length]),
    [
      ["故障兜底", 2],
      ["背景", 1],
    ],
  );
  assert.equal(summary.tasks.length, 2);
  assert.equal(summary.priorities[0].task.report.id, "r1");
  assert.equal(summary.priorities[0].task.task.gap, "故障兜底");
});

test("开始下一场面试保留原面试路径，刷新后仍能回看", () => {
  let workspace = beginSession(initialWorkspace(), session());
  workspace = acceptAnswer(workspace, report("r1"), "r1");
  const next = beginSession(workspace, session("session-2"));
  assert.equal(next.sessions.length, 1);
  assert.equal(next.sessions[0].questions.length, 3);
  assert.equal(next.sessions[0].questions[0].attempts, undefined);
  assert.equal(workspace.sessions.length, 0);
  const restored = loadWorkspace({
    getItem: (key) => (key === STORAGE_KEY ? JSON.stringify(next) : null),
  });
  const sessions = availableSessions(restored);
  assert.equal(sessions.length, 2);
  assert.equal(summarizeSession(sessions[1], restored.records).evaluated, 1);
});

test("旧工作区能读取，但不把历史报告误认为完整面试路径", () => {
  const old = initialWorkspace();
  delete old.sessions;
  old.records = [report("r1")];
  const restored = loadWorkspace({ getItem: () => JSON.stringify(old) });
  assert.deepEqual(restored.sessions, []);
  const sessions = availableSessions(restored);
  assert.equal(sessions[0].pathComplete, false);
  assert.equal(sessions[0].questions.length, 1);
});

test("练习类型与能力来源随报告保存", () => {
  const s = {
    ...session(),
    practiceKind: "targeted",
    practiceGap: "背景",
    originReportId: "original",
  };
  const workspace = acceptAnswer(
    beginSession(initialWorkspace(), s),
    report("r1"),
    "r1",
  );
  const saved = workspace.records[0];
  assert.equal(saved.practiceKind, "targeted");
  assert.equal(saved.practiceGap, "背景");
  assert.equal(saved.questionRequirement.id, "jd.1");
});

test("同题同配置复测可比较，缺口变化不直接声称已掌握", () => {
  const previous = report("previous");
  const current = {
    ...report("current", "q.1", null),
    practiceKind: "retest",
    originReportId: previous.id,
  };
  const comparison = compareReports(current, previous);
  assert.equal(comparison.comparable, true);
  assert.deepEqual(comparison.noLongerReported, ["故障兜底"]);
  assert.equal(comparison.mastered, undefined);
});

test("专项题、题目变化、追问条件变化和旧报告不能直接比较总分", () => {
  const previous = report("previous");
  for (const change of [
    (r) => {
      r.practiceKind = "targeted";
    },
    (r) => {
      delete r.practiceKind;
    },
    (r) => {
      r.input.question = "另一个问题";
    },
    (r) => {
      r.input.history = [{ question: "补充问题", answer: "补充回答" }];
    },
    (r) => {
      r.input.jd = "其他岗位";
    },
    (r) => {
      delete r.evaluation;
    },
    (r) => {
      r.score = null;
    },
  ]) {
    const current = structuredClone({ ...previous, practiceKind: "retest" });
    change(current);
    assert.equal(compareReports(current, previous).comparable, false);
  }
});

test("模型、协议、量表和评估参数变化使分数不可直接比较", () => {
  const previous = report("previous");
  for (const change of [
    (r) => {
      r.model = "other-model";
    },
    (r) => {
      r.provider = "https://another.example/v1";
    },
    (r) => {
      r.evaluation.protocol = "responses";
    },
    (r) => {
      r.evaluation.promptVersion = "prompt-2";
    },
    (r) => {
      r.evaluation.maxOutputTokens = 16000;
    },
    (r) => {
      r.evaluation.jsonMode = true;
    },
    (r) => {
      r.scores[0].rubric.text = "新量表";
    },
  ]) {
    const current = structuredClone({ ...previous, practiceKind: "retest" });
    change(current);
    assert.equal(compareReports(current, previous).comparable, false);
  }
});

test("整场导出只保留一份每题最新原始报告，其余通过 ID 追溯", () => {
  const s = session();
  const records = [report("latest"), report("older")];
  const output = exportSessionSummary(s, summarizeSession(s, records), {
    "latest:task.1": true,
  });
  assert.equal(output.type, "session-summary-v1");
  assert.equal(output.reports.length, 1);
  assert.equal(output.reports[0].id, "latest");
  assert.equal(output.questions[0].reportId, "latest");
  assert.equal(output.questions[1].reportId, null);
  assert.deepEqual(output.capabilities[0].reportIds, ["latest"]);
  assert.equal(output.tasks[0].reportId, "latest");
  assert.equal(output.tasks[0].completed, true);
  assert.equal(output.tasks[0].report, undefined);
  assert.equal(JSON.stringify(output).split('"answerQuote"').length, 1);
  assert.equal(output.reports[0].semanticReview.status, "completed");
  assert.ok(
    output.reports[0].scores.every(
      (row) => row.review.evidenceId === row.evidence.id,
    ),
  );
});

test("历史初评不标记语义通过，不能参与新的复测分数对比", () => {
  const legacy = report("legacy");
  delete legacy.semanticReview;
  legacy.scores.forEach((row) => {
    delete row.review;
  });
  const summary = summarizeSession(session(), [legacy]);
  assert.equal(summary.capabilities[0].status, "unreviewed");
  assert.equal(
    compareReports({ ...report("new"), practiceKind: "retest" }, legacy)
      .comparable,
    false,
  );
});

test("复核版本变化不比较总分，新报告全数不支持时不会沿用旧报告能力证据", () => {
  const previous = report("previous");
  const current = { ...report("current"), practiceKind: "retest" };
  current.semanticReview.version = "next-version";
  assert.equal(compareReports(current, previous).comparable, false);
  current.score = null;
  current.scores.forEach((row) => {
    row.score = null;
    row.status = "semantic_unsupported";
    row.review.verdict = "unsupported";
  });
  assert.equal(
    summarizeSession(session(), [current, previous]).capabilities[0].status,
    "insufficient",
  );
});
