import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  parseAnalysis,
  applySemanticReview,
  isReviewedScore,
  OutputError,
  REVIEW_VERSION,
} from "../shared/analyze.mjs";
import { analyzeInterview, validateConfig } from "../server/provider.mjs";
import { testStructure } from "../server/diagnostics.mjs";
import {
  input,
  config,
  analysis,
  semanticReview,
  chatResponse,
  fixtureFetch,
} from "./fixtures.mjs";

const draft = (data = input) =>
  parseAnalysis(JSON.stringify(analysis(data)), data);
const reviewFor = (report) =>
  semanticReview({
    candidates: report.scores.filter((row) => row.status === "pending_review"),
  });

test("五维复核通过才发布总分，候选分数与初评解释不出现在报告或导出中", () => {
  const candidate = draft();
  const review = reviewFor(candidate);
  const result = applySemanticReview(
    JSON.stringify(review),
    candidate,
    new Date("2026-09-10T10:00:00Z"),
  );
  assert.equal(result.score, 60);
  assert.equal(result.coverage, 100);
  assert.equal(result.semanticReview.version, REVIEW_VERSION);
  assert.equal(result.semanticReview.reviewedAt, "2026-09-10T10:00:00.000Z");
  assert.ok(result.scores.every(isReviewedScore));
  assert.ok(!JSON.stringify(result).includes("proposedScore"));
  assert.ok(!JSON.stringify(result).includes(candidate.scores[0].note));
  assert.equal(candidate.scores[0].status, "pending_review");
  assert.equal(candidate.score, null);
});

test("引用真实但只有团队成果：模型否决个人贡献分，保留原文与复核原因", async () => {
  const data = {
    ...input,
    answer: "团队完成了增长实验，转化率提升。我没有参与设计。",
  };
  const result = await analyzeInterview(data, validateConfig(config), {
    fetchImpl: async (url, options) => {
      const messages = JSON.parse(options.body).messages;
      if (!messages[0].content.includes("任务=review"))
        return fixtureFetch(url, options);
      const payload = JSON.parse(messages[1].content);
      assert.equal(payload.turns[0].answer, data.answer);
      assert.equal(payload.jd, input.jd);
      assert.equal(payload.resume, undefined);
      assert.equal(payload.sources.length, 2);
      assert.equal(
        new Set(payload.candidates.map((row) => row.evidence.answerId)).size,
        1,
      );
      assert.ok(!options.body.includes("回答引用可以定位"));
      const review = semanticReview(payload);
      Object.assign(review.reviews[2], {
        verdict: "unsupported",
        reason: "回答明确未参与设计，团队结果不能支撑本人职责边界。",
      });
      return chatResponse(review);
    },
  });
  assert.equal(result.score, null);
  assert.equal(result.coverage, 80);
  assert.equal(result.scores[2].score, null);
  assert.equal(result.scores[2].status, "semantic_unsupported");
  assert.equal(result.scores[2].evidence.answer.quote, data.answer);
  assert.match(result.scores[2].note, /未参与设计/);
  assert.equal(result.semanticReview.model, config.model);
  assert.equal(
    result.scores[2].review.evidenceId,
    result.scores[2].evidence.id,
  );
});

test("低分不等于缺证，零分通过复核可以发布；无法判断则隐藏分数", () => {
  const value = analysis();
  value.scores[0].score = 0;
  const candidate = parseAnalysis(JSON.stringify(value), input);
  const review = reviewFor(candidate);
  review.reviews[1].verdict = "uncertain";
  const report = applySemanticReview(JSON.stringify(review), candidate);
  assert.equal(report.scores[0].score, 0);
  assert.equal(report.scores[1].score, null);
  assert.equal(report.scores[1].status, "semantic_uncertain");
  assert.equal(report.coverage, 80);
  assert.equal(report.score, null);
});

test("复核拒绝漏项、重复维度、伪造关联、错误结论、空理由和擅自改分", () => {
  for (const mutate of [
    (r) => r.reviews.pop(),
    (r) => r.reviews.push(r.reviews[0]),
    (r) => {
      r.reviews[1] = r.reviews[0];
    },
    (r) => {
      r.reviews[0].dimension = "未知维度";
    },
    (r) => {
      r.reviews[0].evidenceId = "evidence.2";
    },
    (r) => {
      r.reviews[0].evidenceId = "fabricated";
    },
    (r) => {
      r.reviews[0].verdict = "yes";
    },
    (r) => {
      r.reviews[0].reason = "";
    },
    (r) => {
      r.reviews[0].reason = "x".repeat(801);
    },
    (r) => {
      r.reviews[0].score = 5;
    },
    (r) => {
      r.reviews[0].answerQuote = "伪造引文";
    },
    (r) => {
      r.reviews[0] = null;
    },
  ]) {
    const candidate = draft();
    const review = reviewFor(candidate);
    mutate(review);
    assert.throws(
      () => applySemanticReview(JSON.stringify(review), candidate),
      OutputError,
    );
    assert.equal(candidate.score, null);
  }
});

test("部分缺少引用时只复核其余候选维度，不凭复核补齐缺失依据", () => {
  const value = analysis();
  value.scores[0].answerQuote = "";
  const candidate = parseAnalysis(JSON.stringify(value), input);
  const review = reviewFor(candidate);
  const result = applySemanticReview(JSON.stringify(review), candidate);
  assert.equal(result.semanticReview.reviewedCount, 4);
  assert.equal(result.coverage, 80);
  assert.equal(result.scores[0].score, null);
  assert.equal(result.scores[0].review, null);
  assert.equal(result.scores[0].status, "insufficient_evidence");
});

test("完全缺证跳过复核，不调用规则生成分数，结构化测试不能冒充通过", async () => {
  let count = 0;
  const fetchImpl = async (_, options) => {
    count++;
    const data = JSON.parse(JSON.parse(options.body).messages[1].content);
    const value = analysis(data);
    value.scores.forEach((row) => {
      row.score = null;
    });
    return chatResponse(value);
  };
  const result = await analyzeInterview(input, validateConfig(config), {
    fetchImpl,
  });
  assert.equal(count, 1);
  assert.equal(result.semanticReview.status, "not_required");
  assert.equal(result.score, null);
  assert.equal(result.coverage, 0);
  assert.ok(!JSON.stringify(result).includes("proposedScore"));
  await assert.rejects(
    testStructure(validateConfig(config), { fetchImpl }),
    /未产生可复核维度/,
  );
});

test("历史引用轮次原样绑定，复核同时收到后来更正的回答", async () => {
  const data = {
    ...input,
    answer: "更正：我只负责整理数据，实验设计由同事完成。",
    history: [{ question: input.question, answer: input.answer }],
  };
  const result = await analyzeInterview(data, validateConfig(config), {
    fetchImpl: async (_, options) => {
      const messages = JSON.parse(options.body).messages;
      if (messages[0].content.includes("任务=analyze")) {
        const value = analysis(data);
        value.scores[2].answerTurn = 0;
        value.scores[2].answerQuote = input.answer;
        return chatResponse(value);
      }
      const payload = JSON.parse(messages[1].content);
      assert.deepEqual(
        payload.turns.map((turn) => turn.answer),
        [input.answer, data.answer],
      );
      assert.equal(
        payload.sources.find(
          (source) => source.id === payload.candidates[2].evidence.answerId,
        ).turn,
        0,
      );
      const review = semanticReview(payload);
      review.reviews[2].verdict = "uncertain";
      review.reviews[2].reason = "后来的回答更正了个人职责，需澄清归属。";
      return chatResponse(review);
    },
  });
  assert.equal(result.scores[2].evidence.answer.turn, 0);
  assert.equal(result.scores[2].score, null);
});

test("模型复核全数否决仍是有效结构，结构化测试不冒充准确性测试", async () => {
  const result = await testStructure(validateConfig(config), {
    fetchImpl: async (url, options) => {
      const messages = JSON.parse(options.body).messages;
      if (!messages[0].content.includes("任务=review"))
        return fixtureFetch(url, options);
      const review = semanticReview(JSON.parse(messages[1].content));
      review.reviews.forEach((row) => {
        row.verdict = "unsupported";
      });
      return chatResponse(review);
    },
  });
  assert.ok(result.checks.includes("语义复核结构与证据关联"));
});

test("初评与复核共用总截止时间，不为第二次请求重置时限", async () => {
  const signals = [];
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      analyzeInterview(input, validateConfig(config), {
        timeout: 150,
        fetchImpl: async (url, options) => {
          signals.push(options.signal);
          if (signals.length === 1) {
            await delay(20);
            return fixtureFetch(url, options);
          }
          await new Promise((resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => {
                // The first call's signal must expire at the same shared deadline.
                assert.equal(signals[0].aborted, true);
                reject(options.signal.reason);
              },
              { once: true },
            );
          });
        },
      }),
      (error) =>
        error.details.code === "TIMEOUT" &&
        error.details.stage === "semantic_review",
    );
    assert.equal(signals.length, 2);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("总时限已过则不再发起复核调用", async () => {
  let calls = 0;
  await assert.rejects(
    analyzeInterview(input, validateConfig(config), {
      timeout: 5,
      fetchImpl: async (url, options) => {
        calls++;
        await delay(15);
        return fixtureFetch(url, options);
      },
    }),
    (error) => error.details.code === "TIMEOUT",
  );
  assert.equal(calls, 1);
});
