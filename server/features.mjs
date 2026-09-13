import { randomUUID } from "node:crypto";
import {
  InputError,
  validateContext,
  validatePreparation,
  validateAnswer,
  SCHEMA_VERSION,
  REVIEW_VERSION,
} from "../shared/analyze.mjs";
import { DIFFICULTY_VERSION } from "../shared/difficulty.mjs";
import { BRIEFING_VERSION } from "../shared/interviewSetup.mjs";
import { validateWorkspace, digest } from "./store.mjs";
import { credential } from "./credentials.mjs";
import { validateBackup } from "./backups.mjs";
import { routingRoutes, resolveRoutes, safeConfig } from "./routing.mjs";
import { asrRoutes } from "./asr.mjs";
import {
  DEFAULT_BUDGET,
  validateBudget,
  estimateJob,
  priceUsage,
} from "./budget.mjs";
import {
  extractResume,
  extractBriefing,
  prepareInterview,
  analyzeInterview,
  equivalentQuestion,
  verifyTraining,
  analyzeLanguage,
  completion,
  PROMPT_VERSION,
  validateConfig,
} from "./provider.mjs";

export function featureRoutes({
  store,
  jobs,
  readBody,
  send,
  options,
  publicConfig,
  backups,
}) {
  const routing = routingRoutes({ store, jobs, readBody, send });
  const asr = asrRoutes({ store, jobs, readBody, send, options });
  const capture = (id, operation, config, usage, sessionId, budget) => ({
    ...options,
    onUsage: (u) => {
      const row = {
        ...u,
        requestId: id,
        operation,
        createdAt: new Date().toISOString(),
        provider: config.baseUrl,
        sessionId,
        ...priceUsage(u, config, budget),
      };
      usage.push(row);
      store.addUsage(row);
    },
  });
  return async (req, res, s, path) => {
    if (await routing(req, res, s, path)) return true;
    if (await asr(req, res, s, path)) return true;
    const method = req.method;
    const reply = (value, status = 200) => {
      send(res, status, value);
      return true;
    };
    if (path === "/api/budget" && method === "GET")
      return reply(store.get("budget").value || DEFAULT_BUDGET);
    if (path === "/api/budget" && method === "PUT") {
      if (jobs.busy) throw new InputError("请等待任务结束后修改预算");
      const budget = validateBudget(await readBody(req));
      store.put("budget", budget);
      return reply(budget);
    }
    if (path === "/api/workspace") {
      if (method === "GET") return reply(store.get("workspace"));
      if (method === "PUT") {
        const b = await readBody(req);
        const value = validateWorkspace(b.value);
        value.updatedAt = new Date().toISOString();
        const old = store.get("workspace").value;
        const kept = new Set(value.records.map((r) => r.id));
        const removed =
          old?.records.filter((r) => !kept.has(r.id)).map((r) => r.id) || [];
        const revision = store.put("workspace", value, b.revision);
        const sessionIds = new Set(
          [value.session, ...value.sessions].filter(Boolean).map((s) => s.id),
        );
        const removedSessions = [old?.session, ...(old?.sessions || [])]
          .filter((s) => s && !sessionIds.has(s.id))
          .map((s) => s.id);
        store.deleteJobs([...removed, ...removedSessions]);
        return reply({ revision });
      }
      if (method === "DELETE") {
        if (jobs.busy) throw new InputError("请先取消或等待模型任务结束");
        store.clear();
        return reply({ ok: true });
      }
    }
    if (path === "/api/backup" && method === "GET")
      return reply(store.backup());
    if (path === "/api/backup" && method === "POST") {
      if (jobs.busy) throw new InputError("任务运行时不能导入备份");
      const b = await readBody(req);
      validateBackup(b);
      const before = await backups?.run(true);
      if (before?.error)
        throw new InputError(
          "导入前自动备份失败，请检查备份目录后重试，现有工作区未改变",
        );
      store.restore(b);
      return reply(store.get("workspace"));
    }
    if (path === "/api/preferences") {
      if (method === "GET")
        return reply(
          store.get("preferences").value || {
            retentionDays: 90,
            inputRate: 0,
            outputRate: 0,
            currency: "CNY",
          },
        );
      if (method === "PUT") {
        const b = await readBody(req);
        if (
          ![0, 7, 30, 90, 365].includes(b.retentionDays) ||
          ![b.inputRate, b.outputRate].every(
            (n) =>
              typeof n === "number" &&
              Number.isFinite(n) &&
              n >= 0 &&
              n <= 100000,
          ) ||
          !["CNY", "USD"].includes(b.currency)
        )
          throw new InputError("保存期限或费率格式不正确");
        const p = {
          retentionDays: b.retentionDays,
          inputRate: b.inputRate,
          outputRate: b.outputRate,
          currency: b.currency,
        };
        store.put("preferences", p);
        store.purge(p.retentionDays);
        return reply(p);
      }
    }
    if (path === "/api/usage" && method === "GET")
      return reply({
        usage: store.usage(),
        jobs: jobs.list().map(({ result, ...j }) => j),
      });
    if (path === "/api/profiles" && method === "GET")
      return reply({ profiles: store.profiles() });
    if (path === "/api/profiles" && method === "POST") {
      if (!s.config || s.busy || jobs.busy)
        throw new InputError("请先保存当前模型，并等待任务结束");
      const b = await readBody(req);
      if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 80)
        throw new InputError("请输入1–80字符的配置名称");
      const id = randomUUID();
      const { apiKey, ...config } = s.config;
      const metadata = publicConfig(s);
      if (b.rememberKey && apiKey && process.platform === "win32")
        await credential("set", id, apiKey);
      const value = {
        id,
        name: b.name.trim(),
        config,
        hasStoredKey: Boolean(
          b.rememberKey && apiKey && process.platform === "win32",
        ),
        testedAt: metadata?.testedAt || null,
        structureTestedAt: metadata?.structureTestedAt || null,
        createdAt: new Date().toISOString(),
      };
      store.profile(id, value);
      s.profileKeys ||= new Map();
      s.profileKeys.set(id, apiKey);
      return reply(value);
    }
    const profileMatch = path.match(/^\/api\/profiles\/([\w-]+)(\/activate)?$/);
    if (profileMatch) {
      if (s.busy || jobs.busy)
        throw new InputError("请等待模型任务结束后切换配置");
      const p = store.profiles().find((p) => p.id === profileMatch[1]);
      if (!p) throw new InputError("模型配置档案不存在");
      if (method === "DELETE") {
        if (p.hasStoredKey) await credential("delete", p.id);
        store.deleteProfile(p.id);
        s.profileKeys?.delete(p.id);
        return reply({ ok: true });
      }
      if (method === "POST" && profileMatch[2]) {
        s.busy = true;
        try {
          const b = await readBody(req);
          const key = p.hasStoredKey
            ? (await credential("get", p.id)).secret
            : b.apiKey || "";
          s.config = validateConfig({
            ...p.config,
            baseUrl: p.config.endpoint,
            apiKey: key || "",
          });
          s.profileKeys ||= new Map();
          s.profileKeys.set(p.id, key || "");
          const testedAt = p.hasStoredKey || !key ? p.testedAt : null;
          s.cache.clear();
          s.testedAt = testedAt;
          s.testHash = testedAt ? digest(s.config) : null;
          store.put("activeModel", {
            profileId: p.id,
            updatedAt: new Date().toISOString(),
          });
          const { apiKey, ...safe } = s.config;
          return reply({
            config: {
              ...safe,
              hasKey: Boolean(apiKey),
              testedAt,
              profileId: p.id,
            },
            reconfirmConsent: true,
          });
        } finally {
          s.busy = false;
        }
      }
    }
    if (path === "/api/jobs" && method === "GET")
      return reply({ jobs: jobs.list() });
    const jobMatch = path.match(/^\/api\/jobs\/([\w-]+)(\/cancel)?$/);
    if (jobMatch) {
      if (method === "GET") return reply(jobs.get(jobMatch[1]));
      if (method === "POST" && jobMatch[2])
        return reply(jobs.cancel(jobMatch[1]));
    }
    if (
      ["/api/jobs", "/api/jobs/estimate"].includes(path) &&
      method === "POST"
    ) {
      const b = await readBody(req);
      if (!s.config) {
        const e = new InputError("请先连接模型");
        e.status = 409;
        throw e;
      }
      if (s.busy) throw new InputError("已有连接测试正在进行");
      const operation = b.operation;
      if (
        ![
          "briefing",
          "resume",
          "prepare",
          "analyze",
          "equivalent",
          "acceptance",
        ].includes(operation)
      )
        throw new InputError("任务类型不存在");
      let input =
        operation === "prepare"
          ? validatePreparation(b.input)
          : operation === "analyze"
            ? validateAnswer(b.input)
            : operation === "acceptance"
              ? {}
              : validateContext(b.input);
      if (operation === "equivalent")
        input = {
          ...input,
          question: b.input.question,
          criterion: b.input.criterion,
          requirement: b.input.requirement,
        };
      if (operation === "analyze" && b.input.criterion) {
        if (
          typeof b.input.criterion !== "string" ||
          b.input.criterion.length > 2000
        )
          throw new InputError("完成标准无效");
        input.criterion = b.input.criterion;
      }
      if (operation === "acceptance" && b.confirmPaidTest !== true)
        throw new InputError("请确认真实验收会产生模型调用费用");
      const configs =
        operation === "acceptance"
          ? { acceptance: { ...s.config } }
          : await resolveRoutes(store, s, operation, input);
      const config = { ...configs[operation] };
      const budget = store.get("budget").value || DEFAULT_BUDGET;
      const sessionId =
        typeof b.sessionId === "string" && b.sessionId.length <= 100
          ? b.sessionId
          : b.id;
      const estimate = estimateJob(
        operation,
        input,
        configs,
        budget,
        store.usageForSession(sessionId),
        sessionId,
      );
      if (path.endsWith("/estimate")) return reply(estimate);
      if (!store.job(b.id) && estimate.exceeded && b.budgetOverride !== true) {
        const error = new InputError(
          "预算预检未通过，请查看费用预估并明确确认本次继续",
        );
        error.status = 422;
        throw error;
      }
      return reply(
        jobs.start(
          b.id,
          operation,
          input,
          {
            ...config,
            routes: Object.fromEntries(
              Object.entries(configs).map(([role, c]) => [role, digest(c)]),
            ),
          },
          async (signal, id) => {
            const usage = [];
            const optsFor = (role) => ({
              ...capture(
                id,
                role,
                configs[role] || config,
                usage,
                sessionId,
                budget,
              ),
              signal,
            });
            const opts = optsFor(operation);
            if (operation === "analyze") {
              opts.reviewConfig = configs.review;
              opts.reviewOptions = optsFor("review");
            }
            try {
              let result;
              if (operation === "acceptance") {
                const fingerprint = digest(config);
                const record = {
                  fingerprint,
                  config: safeConfig(config),
                  testedAt: new Date().toISOString(),
                  status: "running",
                };
                const save = (row) =>
                  store.put(
                    "acceptance",
                    [
                      row,
                      ...(store.get("acceptance").value || []).filter(
                        (r) => r.fingerprint !== fingerprint,
                      ),
                    ].slice(0, 100),
                  );
                save(record);
                try {
                  result = await acceptance(config, opts);
                  save({ ...record, status: "passed", checks: result.checks });
                } catch (e) {
                  save({
                    ...record,
                    status: signal.aborted ? "cancelled" : "failed",
                    error: "本次验收未通过，请查看对应任务的失败类型",
                    requestId: id,
                  });
                  throw e;
                }
              } else {
                const handler = {
                  briefing: extractBriefing,
                  resume: extractResume,
                  prepare: prepareInterview,
                  analyze: analyzeInterview,
                  equivalent: equivalentQuestion,
                }[operation];
                result = await handler(input, config, opts);
                if (
                  operation === "analyze" &&
                  input.briefing?.languageSettings?.evaluate
                )
                  result.languageAnalysis = await analyzeLanguage(
                    input,
                    configs.language,
                    optsFor("language"),
                  );
                if (operation === "analyze" && input.criterion) {
                  const verification = await verifyTraining(
                    input,
                    configs.mastery,
                    optsFor("mastery"),
                  );
                  const evidenceComplete =
                    result.scores.every((row) => row.status === "supported") &&
                    !result.missing.length;
                  result.trainingVerification = {
                    ...verification,
                    model: configs.mastery.model,
                    endpoint: configs.mastery.endpoint,
                    passed: verification.passed && evidenceComplete,
                    reason: evidenceComplete
                      ? verification.reason
                      : "本次评分仍有缺口或未获复核支持的维度，暂不判定通过。标准核验：" +
                        verification.reason,
                  };
                }
              }
              return {
                ...result,
                usage,
                budget: estimate,
                model: config.model,
                provider: config.baseUrl,
                schemaVersion: result.schemaVersion || SCHEMA_VERSION,
                evaluation: {
                  promptVersion: PROMPT_VERSION,
                  difficultyVersion: DIFFICULTY_VERSION,
                  briefingVersion: input.briefing ? BRIEFING_VERSION : null,
                  reviewVersion:
                    operation === "analyze" ? REVIEW_VERSION : null,
                  endpoint: config.endpoint,
                  protocol: config.protocol,
                  tokenField: config.tokenField,
                  maxOutputTokens: config.maxOutputTokens,
                  jsonMode: config.jsonMode,
                },
              };
            } catch (error) {
              // A timeout/failed review may already have been billed upstream.
              store.addUsage({
                requestId: id,
                sessionId,
                operation,
                model: config.model,
                endpoint: config.endpoint,
                createdAt: new Date().toISOString(),
                inputTokens: null,
                outputTokens: null,
                totalTokens: null,
                estimatedCost: null,
                currency: budget.currency,
                uncertainCharge: true,
              });
              throw error;
            }
          },
        ),
        202,
      );
    }
    return false;
  };
}

async function acceptance(config, options) {
  // Synthetic public material sent to the configured REAL provider; never a product fallback.
  const context = {
    jd: "运营岗位，负责客户反馈分析、项目协作、实验设计和结果验证。",
    resume: "参与客户反馈分类项目，负责整理问题清单并与产品团队协作。",
    difficulty: "standard",
  };
  const checks = [];
  await completion(
    config,
    [{ role: "user", content: 'Return JSON {"ok":true}' }],
    options,
  );
  checks.push("连接");
  const proposal = await extractBriefing(context, config, options);
  checks.push("岗位提取");
  const briefing = { ...proposal, confirmed: true, durationMinutes: 15 };
  const prepared = await prepareInterview(
    { ...context, briefing },
    config,
    options,
  );
  checks.push("出题");
  const answer =
    "我整理了客户反馈并与产品团队协作，当时的具体指标和验证周期还需要核对。";
  const first = await analyzeInterview(
    {
      ...context,
      briefing,
      question: prepared.questions[0].question,
      answer,
      history: [],
    },
    config,
    options,
  );
  checks.push("评分及证据复核");
  if (!first.followUp)
    throw new InputError("验收未产生可验证的追问，此配置尚未通过完整流程");
  await analyzeInterview(
    {
      ...context,
      briefing,
      question: first.followUp.question,
      answer: "我负责汇总和分类，效果数据尚未核实，不能归因为我个人的成果。",
      history: [{ question: prepared.questions[0].question, answer }],
    },
    config,
    options,
  );
  checks.push("追问回答");
  await extractBriefing(
    {
      ...context,
      jd:
        context.jd +
        "\n" +
        "岗位背景补充：需要基于证据进行协作与复盘。".repeat(600),
    },
    config,
    options,
  );
  checks.push("长文本岗位提取");
  return {
    checks,
    verifiedAt: new Date().toISOString(),
    scope:
      "当前地址、模型及协议下的实际调用验收；不代表所有模型兼容，也不替代人工评分质量验收。",
  };
}
