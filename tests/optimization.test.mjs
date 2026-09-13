import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir, cp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.mjs";
import { createStore, validateWorkspace } from "../server/store.mjs";
import {
  createFullBackup,
  restoreFullBackup,
  createFullBackupService,
} from "../server/fullBackup.mjs";
import { passwordRecord } from "../server/access.mjs";
import { validateConfig, analyzeLanguage } from "../server/provider.mjs";
import { validateBudget, priceUsage, estimateJob } from "../server/budget.mjs";
import { initialWorkspace } from "../src/state.js";
import { masteryStatus } from "../shared/mastery.mjs";
import { reportHtml } from "../src/printReport.js";
import { validateContext } from "../shared/analyze.mjs";
import {
  input,
  config,
  fixtureFetch,
  chatResponse,
  confirmedContext,
  reviewedAnalysis,
} from "./fixtures.mjs";

async function app(t, fetchImpl = fixtureFetch) {
  const server = createApp({ fetchImpl });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = async (path, body, method = body ? "POST" : "GET") => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        cookie,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: r.status, data: await r.json() };
  };
  await request("/models", config);
  const job = async (body) => {
    const r = await request("/jobs", body);
    assert.equal(r.status, 202, JSON.stringify(r.data));
    for (let i = 0; i < 200; i++) {
      const j = (await request("/jobs/" + body.id)).data;
      if (!["running", "queued"].includes(j.status)) return j;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error("test job timeout");
  };
  return { request, job };
}

test("full backup scheduler rotates only its snapshots and verifies complete restores", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "evidence-scheduler-test-"));
  let store;
  let service;
  t.after(async () => {
    await service?.close();
    store?.close();
    await rm(dir, { recursive: true, force: true });
  });
  store = createStore(join(dir, "data", "evidence.sqlite"));
  store.put("workspace", initialWorkspace());
  const backupDir = join(dir, "other-disk");
  await mkdir(backupDir);
  await writeFile(join(backupDir, "keep-me.txt"), "other files");
  service = createFullBackupService({
    dataDir: join(dir, "data"),
    directory: backupDir,
    password: "scheduler-test-password",
    keep: 2,
  });
  assert.equal((await service.run()).count, 1);
  assert.equal((await service.run()).count, 1);
  await service.run(true);
  const result = await service.run(true);
  assert.equal(result.count, 2);
  assert.equal(result.error, null);
  assert.equal(
    await readFile(join(backupDir, "keep-me.txt"), "utf8"),
    "other files",
  );
});

test(
  "release staging and rollback build separate code/data directories without altering the running source",
  { timeout: 30000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "evidence-release-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const repo = join(dir, "repo");
    await mkdir(repo);
    await Promise.all(
      ["server", "shared", "scripts"].map((name) =>
        cp(new URL(`../${name}`, import.meta.url), join(repo, name), {
          recursive: true,
        }),
      ),
    );
    const pkg = {
      name: "release-test",
      version: "1.0.0",
      type: "module",
      scripts: { build: "node scripts/test-build.mjs" },
    };
    await writeFile(join(repo, "package.json"), JSON.stringify(pkg));
    await writeFile(
      join(repo, "package-lock.json"),
      JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        lockfileVersion: 3,
        packages: { "": { name: pkg.name, version: pkg.version } },
      }),
    );
    await writeFile(join(repo, ".gitignore"), "data/\ndist/\nnode_modules/\n");
    await writeFile(
      join(repo, "scripts/test-build.mjs"),
      'import {mkdirSync,writeFileSync} from "node:fs";mkdirSync("dist",{recursive:true});writeFileSync("dist/index.html","verified build");',
    );
    const run = (cmd, args) =>
      execFileSync(cmd, args, {
        cwd: repo,
        encoding: "utf8",
        windowsHide: true,
        timeout: 20000,
        env: {
          ...process.env,
          EVIDENCE_BACKUP_PASSPHRASE: "release-test-password",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    run("git", ["init"]);
    run("git", ["add", "."]);
    run("git", [
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=release-test@example.invalid",
      "commit",
      "-m",
      "test release",
    ]);
    const store = createStore(join(repo, "data", "evidence.sqlite"));
    store.put("workspace", initialWorkspace());
    store.close();
    const target = join(dir, "release");
    run(process.execPath, [
      "scripts/release.mjs",
      "stage",
      "--ref",
      "HEAD",
      "--destination",
      target,
    ]);
    const manifest = JSON.parse(
      await readFile(join(target, "release.json"), "utf8"),
    );
    assert.equal(manifest.state, "staged");
    assert.equal(
      await readFile(join(target, "app/dist/index.html"), "utf8"),
      "verified build",
    );
    const restored = createStore(join(target, "data/evidence.sqlite"));
    assert.equal(restored.get("workspace").value.version, 2);
    restored.close();
    const rollback = join(dir, "rollback");
    run(process.execPath, [
      "scripts/release.mjs",
      "rollback",
      "--manifest",
      join(target, "release.json"),
      "--destination",
      rollback,
    ]);
    assert.equal(
      await readFile(join(rollback, "app/dist/index.html"), "utf8"),
      "verified build",
    );
    assert.equal(run("git", ["status", "--porcelain"]).trim(), "");
  },
);

test("task routing sends review only to selected model, tracks billed usage, requires recipient consent and retains idempotency", async (t) => {
  const calls = [];
  const { request, job } = await app(t, async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const response = await fixtureFetch(url, opts),
      data = await response.json();
    data.usage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    };
    return new Response(JSON.stringify(data));
  });
  const primary = validateConfig(config);
  await request("/models", {
    ...config,
    model: "independent-review",
    baseUrl: "http://127.0.0.1:9998/v1",
  });
  const profile = (await request("/profiles", { name: "review profile" })).data;
  await request("/models", config);
  assert.equal(
    (await request("/routing", { routes: { review: profile.id } }, "PUT"))
      .status,
    400,
  );
  await request(
    "/routing",
    { routes: { review: profile.id }, confirmRecipients: true },
    "PUT",
  );
  const budget = {
    limit: 5,
    currency: "CNY",
    rates: [
      {
        endpoint: primary.endpoint,
        model: primary.model,
        inputRate: 1,
        outputRate: 2,
      },
      {
        endpoint: profile.config.endpoint,
        model: profile.config.model,
        inputRate: 3,
        outputRate: 4,
      },
    ],
  };
  assert.equal((await request("/budget", budget, "PUT")).status, 200);
  const body = {
    id: randomUUID(),
    operation: "analyze",
    input,
    sessionId: "session-budget",
  };
  const estimate = await request("/jobs/estimate", body);
  assert.equal(estimate.data.calls.length, 2);
  assert.equal(calls.length, 0);
  const j = await job(body);
  assert.equal(j.status, "succeeded", j.error);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.model, "independent-review");
  assert.match(calls[1].url, /:9998/);
  assert.equal(j.result.semanticReview.model, "independent-review");
  assert.equal(j.result.semanticReview.crossModel, true);
  assert.deepEqual(
    j.result.usage.map((u) => u.operation),
    ["analyze", "review"],
  );
  assert.ok(j.result.usage.every((u) => u.estimatedCost > 0));
  await request("/jobs", body);
  assert.equal(calls.length, 2);
  const safe = JSON.stringify((await request("/routing")).data);
  assert.ok(!safe.includes("apiKey"));
  await request("/models", { ...config, model: "changed-default" });
  assert.equal(
    (await request("/jobs", { ...body, id: randomUUID() })).status,
    400,
  );
  assert.equal(calls.length, 2);
});

test("budget refuses unknown and exceeding spend before upstream; explicit override is per request and preserves missing usage", async (t) => {
  let calls = 0;
  const { request, job } = await app(t, async (...args) => {
    calls++;
    return fixtureFetch(...args);
  });
  await request("/budget", { limit: 0.01, currency: "CNY", rates: [] }, "PUT");
  const body = {
    id: randomUUID(),
    operation: "analyze",
    input,
    sessionId: "limited-interview",
  };
  const estimate = (await request("/jobs/estimate", body)).data;
  assert.equal(estimate.exceeded, true);
  assert.equal(estimate.unknown, true);
  assert.equal((await request("/jobs", body)).status, 422);
  assert.equal(calls, 0);
  assert.equal(
    (await job({ ...body, budgetOverride: true })).status,
    "succeeded",
  );
  assert.equal(calls, 2);
  assert.equal(
    (await request("/jobs", { ...body, id: randomUUID() })).status,
    422,
  );
  assert.equal((await request("/usage")).data.usage[0].estimatedCost, null);
  const c = validateConfig(config),
    b = validateBudget({
      limit: 1,
      currency: "CNY",
      rates: [
        { endpoint: c.endpoint, model: c.model, inputRate: 1, outputRate: 2 },
      ],
    });
  assert.equal(
    priceUsage({ inputTokens: null, outputTokens: 1 }, c, b).estimatedCost,
    null,
  );
  const result = estimateJob(
    "analyze",
    input,
    { analyze: c, review: c },
    b,
    [{ sessionId: "s", currency: "CNY", estimatedCost: 2 }],
    "s",
  );
  assert.equal(result.exceeded, true);
  assert.throws(
    () => validateBudget({ ...b, rates: [...b.rates, ...b.rates] }),
    /重复/,
  );
});

test("latest acceptance failure replaces prior success for the exact configuration", async (t) => {
  let fail = false;
  const { request, job } = await app(t, async (...args) => {
    if (fail) throw new Error("provider offline");
    return fixtureFetch(...args);
  });
  const first = await job({
    id: randomUUID(),
    operation: "acceptance",
    input: {},
    confirmPaidTest: true,
  });
  assert.equal(first.status, "succeeded", first.error);
  assert.equal((await request("/routing")).data.acceptance[0].status, "passed");
  fail = true;
  assert.equal(
    (
      await job({
        id: randomUUID(),
        operation: "acceptance",
        input: {},
        confirmPaidTest: true,
      })
    ).status,
    "failed",
  );
  const matrix = (await request("/routing")).data.acceptance;
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].status, "failed");
});

test("dedicated ASR requires exact-recipient consent, stores no audio, and uses multipart with actual usage", async (t) => {
  let calls = 0;
  const { request } = await app(t, async (url, opts) => {
    calls++;
    assert.ok(opts.body instanceof FormData);
    assert.equal(opts.body.get("model"), "speech-test");
    assert.equal(opts.body.get("language"), "en");
    assert.equal(opts.body.get("file").type, "audio/webm");
    assert.match(url, /audio\/transcriptions$/);
    return new Response(
      JSON.stringify({
        text: "I verified the rollback plan.",
        usage: { input_tokens: 45, output_tokens: 9 },
      }),
    );
  });
  const p = (await request("/profiles", { name: "ASR service" })).data;
  const service = (
    await request(
      "/asr",
      {
        profileId: p.id,
        endpoint: "http://127.0.0.1:9999/v1/audio/transcriptions",
        model: "speech-test",
      },
      "PUT",
    )
  ).data;
  const body = {
    id: randomUUID(),
    configStamp: service.stamp,
    audio: Buffer.from("synthetic-test-audio").toString("base64"),
    mime: "audio/webm",
    durationSeconds: 2,
    language: "en-US",
  };
  assert.equal((await request("/asr/jobs", body)).status, 400);
  assert.equal(calls, 0);
  assert.equal(
    (
      await request("/asr/jobs", {
        ...body,
        confirmAudioUpload: true,
        configStamp: "old",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/asr/jobs", {
        ...body,
        confirmAudioUpload: true,
        mime: "video/webm",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/asr/jobs", { ...body, confirmAudioUpload: true })).status,
    202,
  );
  let j;
  for (let i = 0; i < 100; i++) {
    j = (await request("/jobs/" + body.id)).data;
    if (j.status !== "running") break;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(j.status, "succeeded", j.error);
  assert.equal(j.result.needsConfirmation, true);
  assert.equal(j.result.usage.inputTokens, 45);
  assert.ok(
    !JSON.stringify((await request("/jobs")).data).includes(body.audio),
  );
});

test("independent language settings keep exact quotes and reject fabricated language evidence", async () => {
  const c = validateContext(
    confirmedContext(input, {
      languageSettings: {
        questionLanguage: "en-US",
        answerLanguage: "ja-JP",
        resumeLanguage: "zh-CN",
        targetLevel: "B2",
        evaluate: true,
      },
    }),
  );
  assert.equal(c.languageSettings.answerLanguage, "ja-JP");
  const output = {
    summary: "文字表达观察",
    observations: [
      {
        quote: input.answer.slice(0, 8),
        aspect: "结构",
        suggestion: "先描述职责",
        rewrite: "仅调整原句结构",
      },
    ],
  };
  const result = await analyzeLanguage(c, validateConfig(config), {
    fetchImpl: async (url, opts) => {
      const messages = JSON.parse(opts.body).messages;
      assert.match(messages[0].content, /回答语言=ja-JP/);
      return chatResponse(output);
    },
  }).catch((e) => e);
  // validateContext does not carry answers; full answer is supplied to the evaluation.
  assert.ok(result instanceof Error);
  const good = await analyzeLanguage(
    { ...c, question: input.question, answer: input.answer },
    validateConfig(config),
    { fetchImpl: async () => chatResponse(output) },
  );
  assert.equal(
    input.answer.slice(good.observations[0].start, good.observations[0].end),
    output.observations[0].quote,
  );
  output.observations[0].quote = "并不存在的经历";
  await assert.rejects(
    analyzeLanguage(
      { ...c, question: input.question, answer: input.answer },
      validateConfig(config),
      { fetchImpl: async () => chatResponse(output) },
    ),
    /原文依据/,
  );
});

test("mastery requires fresh equivalent scenarios, spaced passes, unchanged conditions; checkbox never means mastered", () => {
  const original = {
    ...reviewedAnalysis(),
    id: "root",
    createdAt: "2026-01-01T00:00:00Z",
    model: "stable-model",
    provider: "example",
    evaluation: { promptVersion: "fixed" },
  };
  const task = original.trainingPlan.tasks[0];
  const make = (id, date, question, answer) => {
    const report = {
      ...reviewedAnalysis({ ...input, question, answer }, null),
      id,
      createdAt: date,
      originReportId: "root",
      practiceTaskId: task.id,
      practiceKind: "equivalent",
      practiceCriterion: task.criterion,
      equivalence: { confirmed: true },
      model: original.model,
      provider: original.provider,
      evaluation: original.evaluation,
      trainingVerification: {
        passed: true,
        quote: answer,
        start: 0,
        model: "verifier",
        endpoint: "example",
        version: "training-verification-1",
      },
    };
    return report;
  };
  const first = make(
    "first",
    "2026-01-03T00:00:00Z",
    "预算突然减少一半，你如何决定哪些工作暂停？",
    "我先核对资金约束，亲自审批暂停低影响工作并跟踪资金变化。",
  );
  const second = make(
    "second",
    "2026-01-10T00:00:00Z",
    "新法规使业务交付受阻，请给出合规沟通的安排。",
    "我整理受法规影响的事项，与法务一起验证替代流程，每日记录交付状态。",
  );
  assert.equal(
    masteryStatus(original, [], task, true, Date.parse("2026-01-02")).state,
    "practiced",
  );
  assert.equal(
    masteryStatus(original, [first], task, true, Date.parse("2026-01-04"))
      .state,
    "verified",
  );
  const stable = masteryStatus(
    original,
    [first, second],
    task,
    true,
    Date.parse("2026-01-11"),
  );
  assert.equal(stable.state, "stable", JSON.stringify(stable.rejected));
  assert.equal(stable.passes, 2);
  assert.equal(stable.nextDue, "2026-02-09T00:00:00.000Z");
  assert.equal(
    masteryStatus(
      original,
      [first, { ...second, createdAt: "2026-01-04T00:00:00Z" }],
      task,
      false,
      Date.parse("2026-01-05"),
    ).passes,
    1,
  );
  assert.equal(
    masteryStatus(
      original,
      [first, { ...second, model: "different" }],
      task,
      false,
      Date.parse("2026-01-11"),
    ).passes,
    1,
  );
  assert.equal(
    masteryStatus(
      original,
      [
        first,
        { ...second, input: { ...second.input, answer: first.input.answer } },
      ],
      task,
      false,
      Date.parse("2026-01-11"),
    ).passes,
    1,
  );
  assert.equal(
    masteryStatus(
      original,
      [first, second],
      task,
      false,
      Date.parse("2026-02-10"),
    ).state,
    "due",
  );
});

test("materials source positions survive backups, reject invalid spans, expire with retention; print includes escaped media evidence", () => {
  const store = createStore();
  try {
    const w = initialWorkspace();
    w.materials = [
      {
        id: "claim",
        kind: "claim",
        label: "个人贡献",
        source: input.resume,
        quote: input.resume,
        start: 0,
        end: input.resume.length,
        createdAt: "2020-01-01T00:00:00Z",
      },
    ];
    validateWorkspace(w);
    store.put("workspace", w);
    const backup = store.backup();
    store.restore(backup);
    assert.equal(store.get("workspace").value.materials.length, 1);
    assert.throws(
      () =>
        validateWorkspace({
          ...w,
          materials: [{ ...w.materials[0], start: 1 }],
        }),
      /主张/,
    );
    store.purge(7);
    assert.equal(store.get("workspace").value.materials.length, 0);
    const report = reviewedAnalysis({
      ...input,
      answerCapture: {
        kind: "video",
        rawTranscript: "<script>secret</script>",
        confirmedText: input.answer,
        confirmedAt: "2026-01-01",
      },
    });
    const html = reportHtml(report);
    assert.match(html, /转写校对记录/);
    assert.match(html, /&lt;script&gt;/);
    assert.ok(!html.includes("<script>"));
    assert.match(html, /复核理由/);
  } finally {
    store.close();
  }
});

test("encrypted full snapshot restores workspace, profiles, budget, usage and password; bad password/tampering never changes target", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "evidence-full-test-"));
  let store;
  t.after(async () => {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  });
  const data = join(dir, "data");
  await mkdir(data);
  store = createStore(join(data, "evidence.sqlite"));
  store.put("workspace", initialWorkspace());
  store.put("budget", { limit: 5 });
  store.profile("p", {
    id: "p",
    name: "safe-config",
    config: { model: "test" },
  });
  store.addUsage({ inputTokens: 100, sessionId: "test" });
  await writeFile(
    join(data, "access.json"),
    JSON.stringify(await passwordRecord("restore-owner-password")),
  );
  const file = join(dir, "offsite", "snapshot.iecbackup"),
    password = "test-encryption-password";
  await createFullBackup(data, file, password);
  assert.ok(!(await readFile(file, "utf8")).includes("safe-config"));
  await assert.rejects(
    restoreFullBackup(file, join(dir, "bad"), "wrong-password"),
    /口令/,
  );
  const result = await restoreFullBackup(file, join(dir, "restored"), password);
  assert.equal(result.verified, true);
  const restored = createStore(join(dir, "restored", "evidence.sqlite"));
  assert.equal(restored.profiles().length, 1);
  assert.equal(restored.usage().length, 1);
  assert.equal(restored.get("budget").value.limit, 5);
  restored.close();
  assert.equal(
    JSON.parse(await readFile(join(dir, "restored", "access.json"), "utf8"))
      .version,
    1,
  );
  await assert.rejects(
    restoreFullBackup(file, join(dir, "restored"), password),
    /必须为空/,
  );
  const envelope = JSON.parse(await readFile(file, "utf8"));
  envelope.tag = "0".repeat(32);
  const corrupt = join(dir, "tampered.iecbackup");
  await writeFile(corrupt, JSON.stringify(envelope));
  await assert.rejects(
    restoreFullBackup(corrupt, null, password, { verifyOnly: true }),
    /修改/,
  );
});
