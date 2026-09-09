---
name: token-efficient-development
description: Reduce token and API usage while building and testing the interview evidence-chain platform without sacrificing evidence traceability, correctness, or demo reliability.
---

# Token-Efficient Development

Use this skill for all work on the interview evidence-chain platform.

## Operating rules

- Inspect before editing: list the tree and read only the files relevant to the current task.
- Prefer bounded searches (`rg`/targeted file reads) over dumping whole directories or large files.
- Keep a compact task ledger: current objective, files touched, tests run, unresolved risks.
- Reuse existing artifacts, schemas, fixtures, and model outputs; do not regenerate unchanged JD, resume, or answer analyses.
- Cache model calls by a stable hash of provider, model, prompt version, input, and schema version.
- Use low temperature for extraction, scoring, contradiction checks, and evidence selection; reserve higher temperature for question wording only.
- Ask the model for structured JSON with short fields, evidence spans, IDs, and enums rather than prose.
- Never send full histories when a compact session summary plus the latest answer is sufficient.
- Summarize long documents once, then operate on the summary and source spans.
- Batch independent extraction tasks when the provider supports it, but keep scoring evidence independently verifiable.
- Do not call a remote model when deterministic rules, local fixtures, or cached results are sufficient.
- On timeout, malformed JSON, or quota failure, fall back to cached results, rules, or MockProvider and label the source clearly.

## Evidence-chain invariant

Every published score must reference a real answer span, a job-requirement ID, and a rubric/knowledge-base ID. If any reference is missing or cannot be validated, publish `insufficient_evidence` rather than inventing an explanation.

## Response style for development

Return concise progress updates. At the end of each implementation step, report only: changed files, validation performed, and next blocker/risk.
