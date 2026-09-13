import test from "node:test";
import assert from "node:assert/strict";
import { validatePreparation, validateAnswer } from "../shared/analyze.mjs";
import { initialWorkspace } from "../src/state.js";
import { applyJobResult } from "../src/jobResults.js";
import {
  prepareInterview,
  analyzeInterview,
  validateConfig,
  modelContext,
} from "../server/provider.mjs";
import { confirmedContext, fixtureFetch, config, input } from "./fixtures.mjs";
import { trendGroups } from "../src/sessionSummary.js";

test("confirmed mode/language survive prepare, session, analyze/review and differing languages split trends", async () => {
  const context = validatePreparation(
    confirmedContext(
      { ...input, language: "zh-CN", interviewMode: "text" },
      { language: "en-US", interviewMode: "video" },
    ),
  );
  assert.equal(context.interviewMode, "video");
  assert.equal(context.language, "en-US");
  let requests = 0;
  const options = {
    fetchImpl: (url, request) => {
      requests++;
      const messages = JSON.parse(request.body).messages;
      assert.match(messages[0].content, /English/);
      assert.match(messages[0].content, /枚举保持约定中文/);
      assert.doesNotMatch(messages[1].content, /WRONG TRANSCRIPT/);
      return fixtureFetch(url, request);
    },
  };
  const questions = await prepareInterview(
    context,
    validateConfig(config),
    options,
  );
  const w = applyJobResult(
    initialWorkspace(),
    { id: "job-test", operation: "prepare", input: context },
    questions,
  );
  assert.equal(w.session.interviewMode, "video");
  assert.equal(w.session.language, "en-US");
  const data = {
    ...context,
    answer: input.answer,
    question: input.question,
    answerCapture: {
      kind: "video",
      rawTranscript: "WRONG TRANSCRIPT",
      confirmedText: input.answer,
      confirmedAt: new Date().toISOString(),
    },
  };
  const report = await analyzeInterview(data, validateConfig(config), options);
  assert.equal(report.input.answerCapture.rawTranscript, "WRONG TRANSCRIPT");
  assert.equal(modelContext(data).answerCapture, undefined);
  assert.equal(requests, 3);
  assert.throws(
    () => validateAnswer({ ...data, answer: "changed" }),
    /转写确认/,
  );
  const other = structuredClone(report);
  other.input.language = "ja-JP";
  assert.equal(trendGroups([report, other]).length, 2);
});
