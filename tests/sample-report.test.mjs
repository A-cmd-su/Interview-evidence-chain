import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleReport } from "../src/sampleReport.js";
import { validateAnswer, isReviewedScore } from "../shared/analyze.mjs";

test("sample report is fully supported by exact source spans", () => {
  const input = validateAnswer(sampleReport.input);
  assert.equal(sampleReport.scores.length, 5);
  for (const row of sampleReport.scores) {
    assert.ok(isReviewedScore(row), `${row.dimension} must publish a score`);
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
  }
  assert.equal(sampleReport.coverage, 100);
  assert.equal(sampleReport.score, 72);
  assert.match(sampleReport.model, /示例/);
});
