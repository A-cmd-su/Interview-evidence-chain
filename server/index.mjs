import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createStore } from "./store.mjs";
import { createJobs } from "./jobs.mjs";
import { featureRoutes } from "./features.mjs";
import { configureProxy } from "./network.mjs";
import { testStructure } from "./diagnostics.mjs";
import { DIFFICULTY_VERSION } from "../shared/difficulty.mjs";
import { BRIEFING_VERSION } from "../shared/interviewSetup.mjs";
import {
  InputError,
  OutputError,
  validateContext,
  validateAnswer,
  validatePreparation,
  SCHEMA_VERSION,
  REVIEW_VERSION,
} from "../shared/analyze.mjs";
import {
  validateConfig,
  completion,
  listModels,
  prepareInterview,
  extractBriefing,
  analyzeInterview,
  ProviderError,
  PROMPT_VERSION,
} from "./provider.mjs";

const TTL = 2 * 60 * 60 * 1000;
const ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const structureHash = (config) =>
  hash({
    config,
    prompt: PROMPT_VERSION,
    schema: SCHEMA_VERSION,
    review: REVIEW_VERSION,
    difficulty: DIFFICULTY_VERSION,
    briefing: BRIEFING_VERSION,
  });
function send(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new InputError("请求必须使用 application/json");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (
      bytes >
      (req.url?.startsWith("/api/workspace") ||
      req.url?.startsWith("/api/backup")
        ? 25 * 1024 * 1024
        : 600000)
    )
      throw new InputError("请求体过大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("请求 JSON 无法解析");
  }
}
function publicConfig(s) {
  if (!s.config) return null;
  const { apiKey, ...config } = s.config;
  return {
    ...config,
    hasKey: Boolean(apiKey),
    testedAt: s.testHash === hash(s.config) ? s.testedAt : null,
    structureTestedAt:
      s.structureHash === structureHash(s.config) ? s.structureTestedAt : null,
  };
}
export function createApp(options = {}) {
  const store = createStore(options.dbPath || ":memory:");
  const jobs = createJobs(store);
  const features = featureRoutes({
    store,
    jobs,
    readBody,
    send,
    options,
    publicConfig,
  });
  store.purge(store.get("preferences").value?.retentionDays ?? 90);
  const cleanup = setInterval(() => {
    if (!jobs.busy)
      store.purge(store.get("preferences").value?.retentionDays ?? 90);
  }, 86400000);
  cleanup.unref();
  const sessions = new Map();
  const origins = new Set(ORIGINS);
  for (const port of [options.webPort, options.previewPort].filter(
    (port) => port !== undefined,
  )) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("前端端口需为 1024–65535 的整数");
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
  }
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ""))
      return send(res, 403, { error: "Host 不被允许" });
    if (
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(res, 403, { error: "拒绝跨站访问本机 API" });
    try {
      const now = Date.now();
      for (const [id, session] of sessions)
        if (session.expires < now && !session.busy) sessions.delete(id);
      let sid = (req.headers.cookie || "").match(
        /(?:^|;\s*)evidence_sid=([\w-]+)/,
      )?.[1];
      if (!sessions.has(sid)) {
        if (sessions.size >= 100)
          return send(res, 429, { error: "会话数量已达上限" });
        sid = crypto.randomUUID();
        sessions.set(sid, {
          config: null,
          testedAt: null,
          testHash: null,
          cache: new Map(),
          expires: now + TTL,
          busy: false,
        });
        res.setHeader(
          "set-cookie",
          `evidence_sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200`,
        );
      }
      const s = sessions.get(sid);
      const path = new URL(req.url, "http://localhost").pathname;
      const requestOptions = {
        ...options,
        onUsage: (u) =>
          store.addUsage({
            ...u,
            requestId,
            operation: path,
            createdAt: new Date().toISOString(),
          }),
      };
      if (await features(req, res, s, path)) return;
      if (req.method === "GET" && path === "/api/health")
        return send(res, 200, {
          ok: true,
          config: publicConfig(s),
          schemaVersion: SCHEMA_VERSION,
        });
      if (req.method === "GET" && path === "/api/models")
        return send(res, 200, { config: publicConfig(s) });
      if (req.method === "DELETE" && path === "/api/session") {
        if (s.busy || jobs.busy)
          return send(res, 409, { error: "请等待当前模型请求结束" });
        sessions.delete(sid);
        res.setHeader(
          "set-cookie",
          "evidence_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
        );
        return send(res, 200, { ok: true });
      }
      if (
        req.method !== "POST" ||
        ![
          "/api/models",
          "/api/models/test",
          "/api/models/list",
          "/api/models/test-structure",
          "/api/interview/prepare",
          "/api/interview/briefing",
          "/api/interview/analyze",
        ].includes(path)
      )
        return send(res, 404, { error: "接口不存在" });
      if (s.busy || jobs.busy)
        return send(res, 429, { error: "已有模型请求正在处理，请稍后重试" });
      const payload = await readBody(req);
      if (s.busy || jobs.busy)
        return send(res, 429, { error: "已有模型请求正在处理，请稍后重试" });
      if (path.startsWith("/api/models")) {
        const validation = { requireModel: !path.endsWith("/list") };
        // Reuse never returns the secret to the browser and never forwards it to a changed host.
        let config;
        if (payload?.reuseSavedKey) {
          if (!s.config) throw new InputError("模型会话已过期，请重新填写 Key");
          config = validateConfig(
            { ...payload, apiKey: s.config.apiKey },
            validation,
          );
          if (config.baseUrl !== s.config.baseUrl)
            throw new InputError("修改 API 地址后请重新填写 Key");
        } else config = validateConfig(payload, validation);
        if (path.endsWith("/list")) {
          s.busy = true;
          try {
            return send(res, 200, await listModels(config, requestOptions));
          } finally {
            s.busy = false;
          }
        }
        if (path.endsWith("/test-structure")) {
          if (payload.confirmPaidTest !== true)
            throw new InputError("请先确认结构化测试可能产生模型调用费用");
          s.busy = true;
          s.structureHash = null;
          s.structureTestedAt = null;
          try {
            const started = Date.now();
            const result = await testStructure(config, requestOptions);
            s.structureHash = structureHash(config);
            s.structureTestedAt = new Date().toISOString();
            return send(res, 200, {
              ...result,
              latencyMs: Date.now() - started,
              structureTestedAt: s.structureTestedAt,
            });
          } finally {
            s.busy = false;
          }
        }
        if (path.endsWith("/test")) {
          s.busy = true;
          s.testHash = null;
          s.testedAt = null;
          try {
            const started = Date.now();
            const connection = await completion(
              config,
              [{ role: "user", content: 'Return a JSON object {"ok":true}.' }],
              {
                ...requestOptions,
                maxTokens: Math.min(config.maxOutputTokens, 1024),
                probe: true,
              },
            );
            s.testHash = hash(config);
            s.testedAt = new Date().toISOString();
            return send(res, 200, {
              ...connection,
              latencyMs: Date.now() - started,
              testedAt: s.testedAt,
              message: "模型接口响应成功；分析时仍会单独校验证据格式。",
            });
          } finally {
            s.busy = false;
          }
        }
        s.config = config;
        if (s.testHash !== hash(config)) s.testedAt = null;
        s.cache.clear();
        return send(res, 200, { config: publicConfig(s) });
      }
      const input = path.endsWith("/briefing")
        ? validateContext(payload)
        : path.endsWith("/prepare")
          ? validatePreparation(payload)
          : validateAnswer(payload);
      if (!s.config)
        return send(res, 409, {
          error: "模型配置已过期或尚未保存，请打开模型设置",
        });
      const key = hash({
        path,
        input,
        config: s.config,
        version: PROMPT_VERSION,
        schema: SCHEMA_VERSION,
        review: REVIEW_VERSION,
        difficulty: DIFFICULTY_VERSION,
        briefing: BRIEFING_VERSION,
      });
      if (s.cache.has(key))
        return send(res, 200, { ...s.cache.get(key), cached: true });
      s.busy = true;
      try {
        const result = path.endsWith("/briefing")
          ? await extractBriefing(input, s.config, requestOptions)
          : path.endsWith("/prepare")
            ? await prepareInterview(input, s.config, requestOptions)
            : await analyzeInterview(input, s.config, requestOptions);
        const data = {
          ...result,
          model: s.config.model,
          provider: s.config.baseUrl,
          evaluation: {
            promptVersion: PROMPT_VERSION,
            difficultyVersion: DIFFICULTY_VERSION,
            briefingVersion: input.briefing ? BRIEFING_VERSION : null,
            reviewVersion: path.endsWith("/analyze") ? REVIEW_VERSION : null,
            endpoint: s.config.endpoint,
            protocol: s.config.protocol,
            tokenField: s.config.tokenField,
            maxOutputTokens: s.config.maxOutputTokens,
            jsonMode: s.config.jsonMode,
          },
        };
        if (s.cache.size >= 30) s.cache.delete(s.cache.keys().next().value);
        s.cache.set(key, data);
        return send(res, 200, data);
      } finally {
        s.busy = false;
      }
    } catch (error) {
      const status =
        error.status ||
        (error instanceof InputError
          ? 400
          : error instanceof OutputError || error instanceof ProviderError
            ? 502
            : 500);
      return send(res, status, {
        requestId,
        error: status === 500 ? "服务处理失败，请重试" : error.message,
        ...(error instanceof ProviderError ? { details: error.details } : {}),
      });
    }
  });
  server.on("close", () => {
    clearInterval(cleanup);
    jobs.close();
    if (!jobs.busy) store.close();
  });
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  configureProxy();
  const port = Number(process.env.API_PORT || 8787);
  createApp({
    dbPath: resolve(process.env.DATA_DIR || "data", "evidence.sqlite"),
    webPort: Number(process.env.WEB_PORT || 5173),
    previewPort: Number(process.env.PREVIEW_PORT || 4173),
  })
    .on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? `API 端口 ${port} 已被占用，请调整 API_PORT 后重试。`
          : "API 启动失败：" + error.code,
      );
      process.exitCode = 1;
    })
    .listen(port, "127.0.0.1", () =>
      console.log(`Evidence Loop API http://127.0.0.1:${port}`),
    );
}
