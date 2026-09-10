import test from "node:test";
import assert from "node:assert/strict";
import {
  parseQuestions,
  parseAnalysis,
  validateAnswer,
  OutputError,
} from "../shared/analyze.mjs";
import { input, prepared, analysis } from "./fixtures.mjs";
import {
  initialWorkspace,
  questionState,
  acceptAnswer,
  followQuestion,
} from "../src/state.js";

test("任意岗位问题必须关联逐字岗位引用", () => {
  for (const jd of [
    "销售经理，负责客户沟通、合同谈判和业绩验证。",
    "前端工程师，负责React开发与页面可访问性。",
    input.jd,
  ]) {
    const ctx = { ...input, jd };
    const result = parseQuestions(JSON.stringify(prepared(ctx)), ctx);
    assert.equal(result.questions[0].requirement.quote, jd);
    assert.equal(result.capabilities[0].quote, jd);
  }
  const bad = prepared();
  bad.questions[0].requirementId = "invented";
  assert.throws(() => parseQuestions(JSON.stringify(bad), input), OutputError);
});
test("原文引用校验只生成待复核草稿，不发布分数，日期可复现", () => {
  const report = parseAnalysis(
    JSON.stringify(analysis()),
    input,
    new Date("2026-09-10T10:00:00Z"),
  );
  assert.equal(report.score, null);
  assert.equal(report.coverage, 0);
  assert.equal(report.trainingPlan.dueAt, "2026-09-12T10:00:00.000Z");
  for (const row of report.scores) {
    assert.equal(row.status, "pending_review");
    assert.equal(row.score, null);
    assert.equal(
      input.answer.slice(row.evidence.answer.start, row.evidence.answer.end),
      row.evidence.answer.quote,
    );
    assert.equal(
      input.jd.slice(
        row.evidence.requirement.start,
        row.evidence.requirement.end,
      ),
      row.evidence.requirement.quote,
    );
    assert.equal(row.evidence.knowledgeId, row.rubric.id);
  }
});
for (const field of ["answerQuote", "requirementQuote", "knowledgeId"]) {
  test("缺少" + field + "时不发布该项分数或总分", () => {
    const value = analysis();
    value.scores[0][field] = "";
    const report = parseAnalysis(JSON.stringify(value), input);
    assert.equal(report.score, null);
    assert.equal(report.coverage, 0);
    assert.equal(report.scores[0].status, "insufficient_evidence");
  });
}
test("量表不属于该维度时不得补造知识依据", () => {
  const value = analysis();
  value.scores[0].knowledgeId = "rubric.results.v1";
  assert.equal(
    parseAnalysis(JSON.stringify(value), input).scores[0].score,
    null,
  );
});
for (const field of ["answerQuote", "requirementQuote"]) {
  test("伪造" + field + "拒绝整份结果", () => {
    const value = analysis();
    value.scores[0][field] = "不存在于输入的引用";
    assert.throws(
      () => parseAnalysis(JSON.stringify(value), input),
      /不在原文/,
    );
  });
}
test("追问比较历史回答，引用保留原始轮次，两轮后停止", () => {
  const data = {
    ...input,
    answer: "我当时只负责埋点，实验由同事设计。",
    history: [{ question: input.question, answer: input.answer }],
  };
  const value = analysis(data);
  value.scores[0].answerTurn = 0;
  value.scores[0].answerQuote = input.answer;
  value.consistency = [
    {
      source: "history",
      turn: 0,
      claimQuote: input.answer,
      answerQuote: data.answer,
      reason: "职责范围需要澄清。",
      question: "请说明实验设计由谁完成。",
    },
  ];
  const report = parseAnalysis(JSON.stringify(value), data);
  assert.equal(report.consistency[0].type, "待澄清");
  assert.equal(report.scores[0].evidence.answer.turn, 0);
  const third = {
    ...data,
    history: [...data.history, { question: "请澄清职责", answer: data.answer }],
  };
  assert.equal(
    parseAnalysis(JSON.stringify(analysis(third)), third).followUp,
    null,
  );
});
test("虚构澄清引用、空计划、重复维度、错位训练和非法分数被拒绝", () => {
  for (const mutate of [
    (v) => {
      v.consistency = [
        {
          source: "resume",
          claimQuote: "虚构主张",
          answerQuote: input.answer,
          reason: "原因",
          question: "问题",
        },
      ];
    },
    (v) => {
      v.trainingPlan = null;
    },
    (v) => {
      v.scores[1] = v.scores[0];
    },
    (v) => {
      v.trainingPlan.tasks[0].gap = "背景";
    },
    (v) => {
      v.scores[0].score = 9;
    },
  ]) {
    const value = analysis();
    mutate(value);
    assert.throws(() => parseAnalysis(JSON.stringify(value), input));
  }
});
test("历史回合超限与离线请求被拒绝", () => {
  assert.throws(() => validateAnswer({ ...input, mode: "offline" }));
  assert.throws(() =>
    validateAnswer({ ...input, history: [input, input, input] }),
  );
});
test("前端逐题绑定报告，追问需要显式进入，不覆盖上一轮答案", () => {
  const w = initialWorkspace();
  w.session = {
    id: "s1",
    current: 0,
    questions: [questionState({ id: "q1", question: input.question })],
  };
  const report = parseAnalysis(JSON.stringify(analysis()), input);
  const next = acceptAnswer(w, report, "report1");
  assert.equal(next.session.questions[0].ready, false);
  assert.equal(next.records[0].input.answer, input.answer);
  const followed = followQuestion(next.session.questions[0], next.records[0]);
  assert.equal(followed.ready, true);
  assert.equal(followed.attempts.length, 1);
  assert.equal(followed.prompt, report.followUp.question);
  assert.equal(w.records.length, 0);
});
