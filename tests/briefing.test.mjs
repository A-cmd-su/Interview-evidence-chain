import test from "node:test";
import assert from "node:assert/strict";
import {
  validateBriefing,
  validatePreparation,
  parseBriefing,
  parseQuestions,
  parseAnalysis,
  applySemanticReview,
  InputError,
  OutputError,
} from "../shared/analyze.mjs";
import { DURATIONS, BRIEFING_VERSION } from "../shared/interviewSetup.mjs";
import {
  extractBriefing,
  prepareInterview,
  analyzeInterview,
  validateConfig,
} from "../server/provider.mjs";
import {
  initialWorkspace,
  loadWorkspace,
  isPreparationCurrent,
  beginSession,
  questionState,
  acceptAnswer,
  sessionSnapshot,
} from "../src/state.js";
import {
  compareReports,
  summarizeSession,
  exportSessionSummary,
} from "../src/sessionSummary.js";
import {
  input,
  config,
  briefingOutput,
  confirmedContext,
  prepared,
  fixtureFetch,
  analysis,
  semanticReview,
  reviewedAnalysis,
} from "./fixtures.mjs";

test("岗位预提取只发送JD，返回待确认标签与资历来源，不生成问题", async () => {
  let calls = 0;
  const result = await extractBriefing(input, validateConfig(config), {
    fetchImpl: (url, options) => {
      calls++;
      const messages = JSON.parse(options.body).messages;
      assert.match(messages[0].content, /任务=briefing/);
      assert.deepEqual(JSON.parse(messages[1].content), { jd: input.jd });
      return fixtureFetch(url, options);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.confirmed, false);
  assert.equal(result.questions, undefined);
  assert.equal(result.seniority, "unspecified");
  assert.equal(result.seniorityEvidence, null);
  assert.equal(result.capabilities[0].quote, input.jd);
  assert.equal(result.durationMinutes, 30);
});

test("模型推断资历必须有JD原文，伪造能力与资历引用均拒绝", () => {
  const data = { ...input, jd: "高级产品经理，负责用户增长分析。" };
  const value = {
    ...briefingOutput(data),
    seniority: "senior",
    seniorityQuote: "高级产品经理",
  };
  const parsed = parseBriefing(JSON.stringify(value), data);
  assert.equal(parsed.seniorityEvidence.start, 0);
  for (const mutate of [
    (v) => {
      v.seniorityQuote = "";
    },
    (v) => {
      v.seniorityQuote = "具备十年工作经验";
    },
    (v) => {
      v.seniority = "invented";
    },
    (v) => {
      v.capabilities[0].requirementQuote = "无中生有的岗位要求";
    },
    (v) => {
      v.capabilities.push({ ...v.capabilities[0] });
    },
  ]) {
    const changed = structuredClone(value);
    mutate(changed);
    assert.throws(
      () => parseBriefing(JSON.stringify(changed), data),
      OutputError,
    );
  }
});

test("未经确认、过期版本、无效设置及不存在于JD的原文不得进入出题", async () => {
  assert.throws(() => validatePreparation(input), InputError);
  const context = confirmedContext();
  for (const mutate of [
    (b) => {
      b.confirmed = false;
    },
    (b) => {
      b.version = "old";
    },
    (b) => {
      b.title = "";
    },
    (b) => {
      b.focus = "unknown";
    },
    (b) => {
      b.seniority = "unknown";
    },
    (b) => {
      b.durationMinutes = 25;
    },
    (b) => {
      b.durationMinutes = "30";
    },
    (b) => {
      b.capabilities = [];
    },
    (b) => {
      b.capabilities[0].quote = "不在JD中";
    },
    (b) => {
      b.capabilities[0].label = "";
    },
    (b) => {
      b.capabilities.push({ ...b.capabilities[0] });
    },
    (b) => {
      b.capabilities = Array.from({ length: 11 }, () => b.capabilities[0]);
    },
  ]) {
    const data = structuredClone(context);
    mutate(data.briefing);
    await assert.rejects(
      prepareInterview(data, validateConfig(config), {
        fetchImpl: () => assert.fail("invalid settings invoked model"),
      }),
      InputError,
    );
  }
});

for (const duration of DURATIONS) {
  test(`${duration.minutes}分钟按确认设置生成${duration.questions}道题且不覆盖用户修正`, async () => {
    const context = confirmedContext(input, {
      title: "用户校正岗位",
      capabilities: [
        { label: "用户校正的能力", quote: "负责用户增长分析与实验设计" },
      ],
      seniority: "mid",
      focus: "projects",
      durationMinutes: duration.minutes,
    });
    const result = await prepareInterview(context, validateConfig(config), {
      fetchImpl: fixtureFetch,
    });
    assert.equal(result.questions.length, duration.questions);
    assert.equal(result.title, "用户校正岗位");
    assert.equal(result.capabilities[0].label, "用户校正的能力");
    assert.equal(result.questions[0].requirement.id, "jd.1");
    const malicious = prepared(context);
    malicious.capabilities = [
      { label: "模型重新写的标签", requirementQuote: input.jd },
    ];
    malicious.title = "忽略用户标题";
    assert.equal(
      parseQuestions(JSON.stringify(malicious), context).title,
      "用户校正岗位",
    );
    malicious.questions.pop();
    assert.throws(
      () => parseQuestions(JSON.stringify(malicious), context),
      /数量不符/,
    );
    malicious.questions = prepared(context).questions;
    malicious.questions[0].requirementId = "jd.99";
    assert.throws(
      () => parseQuestions(JSON.stringify(malicious), context),
      /有效岗位能力/,
    );
  });
}

test("确认能力的字符位置与ID由原文重算，不信任客户端位置", () => {
  const value = confirmedContext(input, {
    capabilities: [
      {
        id: "fake",
        label: "增长",
        quote: "用户增长分析",
        start: 999,
        end: 1000,
      },
    ],
  }).briefing;
  assert.equal(value.capabilities[0].id, "jd.1");
  assert.equal(value.capabilities[0].start, input.jd.indexOf("用户增长分析"));
});

test("资历、侧重点和标签随初评与复核传递；未确认的JD范围不发布分数", async () => {
  const context = confirmedContext(input, {
    capabilities: [{ label: "用户增长分析", quote: "用户增长分析" }],
    focus: "expertise",
    seniority: "mid",
  });
  const tasks = [];
  const report = await analyzeInterview(context, validateConfig(config), {
    fetchImpl: (url, options) => {
      const messages = JSON.parse(options.body).messages;
      tasks.push(messages[0].content.match(/任务=(\w+)/)[1]);
      assert.match(messages[0].content, /专业方法/);
      assert.deepEqual(
        JSON.parse(messages[1].content).briefing,
        context.briefing,
      );
      return fixtureFetch(url, options);
    },
  });
  assert.deepEqual(tasks, ["analyze", "review"]);
  assert.equal(report.scores[0].evidence.requirement.id, "jd.1");
  const value = analysis(context);
  value.scores[0].requirementQuote = "跨团队协作";
  const draft = parseAnalysis(JSON.stringify(value), context);
  const review = semanticReview({
    candidates: draft.scores.filter((row) => row.status === "pending_review"),
  });
  const final = applySemanticReview(JSON.stringify(review), draft);
  assert.equal(final.scores[0].score, null);
  assert.match(final.scores[0].note, /不在本次确认/);
  assert.equal(final.coverage, 80);
});

test("校对草稿刷新恢复，JD/简历/难度变化或版本过期时失效", () => {
  const workspace = initialWorkspace();
  workspace.draft = {
    jd: input.jd,
    resume: input.resume,
    difficulty: "standard",
  };
  const proposal = parseBriefing(JSON.stringify(briefingOutput(input)), input);
  workspace.preparation = {
    source: { ...workspace.draft },
    proposal,
    edited: { ...proposal, title: "修改后的标题" },
  };
  assert.equal(
    loadWorkspace({ getItem: () => JSON.stringify(workspace) }).preparation
      .edited.title,
    "修改后的标题",
  );
  for (const key of ["jd", "resume", "difficulty"]) {
    const changed = structuredClone(workspace);
    changed.draft[key] = "changed";
    assert.equal(
      isPreparationCurrent(changed.preparation, changed.draft),
      false,
    );
    assert.equal(
      loadWorkspace({ getItem: () => JSON.stringify(changed) }).preparation,
      null,
    );
  }
  workspace.preparation.edited.version = "old";
  assert.equal(
    loadWorkspace({ getItem: () => JSON.stringify(workspace) }).preparation,
    null,
  );
});

test("设置快照随报告和整场导出保存，修改资历/侧重点/时间/标签阻止总分比较", () => {
  const context = confirmedContext();
  const base = {
    ...reviewedAnalysis(context),
    evaluation: { promptVersion: "test" },
    practiceKind: "retest",
  };
  assert.equal(compareReports(structuredClone(base), base).comparable, true);
  for (const patch of [
    { seniority: "senior" },
    { focus: "behavioral" },
    { durationMinutes: 60 },
    { title: "其他岗位" },
    { capabilities: [{ label: "不同标签", quote: input.jd }] },
  ]) {
    const current = structuredClone(base);
    current.input.briefing = validateBriefing(
      { ...current.input.briefing, ...patch },
      input.jd,
    );
    assert.equal(compareReports(current, base).comparable, false);
    assert.match(compareReports(current, base).reason, /岗位确认/);
  }
  const path = parseQuestions(JSON.stringify(prepared(context)), context);
  const session = {
    ...context,
    ...path,
    id: "session-1",
    current: 0,
    questions: path.questions.map(questionState),
  };
  const workspace = acceptAnswer(
    beginSession(initialWorkspace(), session),
    base,
    "report-1",
  );
  const snapshot = sessionSnapshot(workspace.session);
  const exported = exportSessionSummary(
    snapshot,
    summarizeSession(snapshot, workspace.records),
  );
  assert.equal(exported.session.briefing.version, BRIEFING_VERSION);
  assert.deepEqual(exported.reports[0].input.briefing, context.briefing);
});
