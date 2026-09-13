import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createAccess } from "./access.mjs";
import { credential } from "./credentials.mjs";
import { createBackups } from "./backups.mjs";
import { serveStatic, productionHeaders } from "./static.mjs";
import { createStore } from "./store.mjs";
import { createJobs } from "./jobs.mjs";
import { featureRoutes } from "./features.mjs";
import { createFullBackupService } from "./fullBackup.mjs";
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
      req.url?.startsWith("/api/backup") ||
      req.url === "/api/asr/jobs"
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
    profileId: s.persistentConfig?.profileId || null,
    persistent: Boolean(s.persistentConfig),
    testedAt: s.testHash === hash(s.config) ? s.testedAt : null,
    structureTestedAt:
      s.structureHash === structureHash(s.config) ? s.structureTestedAt : null,
  };
}
export function createApp(options = {}) {
  if (
    !options.publicOrigin &&
    (options.allowedHosts?.some(
      (h) => !["localhost", "127.0.0.1"].includes(h),
    ) ||
      options.allowedOrigins?.some(
        (o) => !["localhost", "127.0.0.1"].includes(new URL(o).hostname),
      ))
  )
    throw new Error("远程域名请使用 PUBLIC_ORIGIN 配置 HTTPS，并启用个人密码");
  const access = createAccess(options.passwordRecord, {
    secure: Boolean(options.publicOrigin?.startsWith("https:")),
  });
  if (options.publicOrigin && !access.required)
    throw new Error("远程访问需要先设置个人密码：npm run set-password");
  const store = createStore(options.dbPath || ":memory:");
  const persistentConfigEnabled =
    options.dbPath && options.dbPath !== ":memory:";
  const persistentProfile = (s) => {
    const active = store.get("activeModel").value;
    const profile =
      active?.profileId &&
      store.profiles().find((p) => p.id === active.profileId);
    if (!profile) return null;
    return {
      ...profile.config,
      hasKey: Boolean(profile.hasStoredKey),
      profileId: profile.id,
      testedAt: profile.testedAt || null,
      structureTestedAt: profile.structureTestedAt || null,
    };
  };
  const hydratePersistentConfig = async (s) => {
    if (s.config || s.persistentConfigChecked) return;
    s.persistentConfigChecked = true;
    const safe = persistentProfile(s);
    s.persistentConfig = safe;
    if (!safe) return;
    const profile = store.profiles().find((p) => p.id === safe.profileId);
    const localModel = (() => {
      try {
        return ["127.0.0.1", "localhost", "[::1]"].includes(
          new URL(profile?.config?.baseUrl || profile?.config?.endpoint)
            .hostname,
        );
      } catch {
        return false;
      }
    })();
    if (!profile?.hasStoredKey && !localModel) return;
    try {
      const key = profile.hasStoredKey
        ? (await credential("get", profile.id)).secret
        : "";
      if (key || localModel) {
        s.config = validateConfig({
          ...profile.config,
          baseUrl: profile.config.endpoint,
          apiKey: key,
        });
        s.profileKeys ||= new Map();
        s.profileKeys.set(profile.id, key);
        s.testedAt = profile.testedAt;
        s.testHash = profile.testedAt ? hash(s.config) : null;
      }
    } catch {
      s.persistentConfig = {
        ...safe,
        hasKey: false,
        testedAt: null,
        structureTestedAt: null,
      };
    }
  };
  const persistModel = async (s, config) => {
    if (!persistentConfigEnabled) return null;
    const safe = (({ apiKey, ...value }) => value)(config);
    const same = store
      .profiles()
      .find(
        (p) =>
          p.config.endpoint === config.endpoint &&
          p.config.model === config.model &&
          p.config.protocol === config.protocol,
      );
    const id = same?.id || crypto.randomUUID();
    if (config.apiKey && process.platform === "win32")
      await credential("set", id, config.apiKey);
    const profile = {
      id,
      name: same?.name || `默认模型 · ${config.model}`,
      config: safe,
      hasStoredKey: Boolean(config.apiKey),
      testedAt: s.testHash === hash(config) ? s.testedAt : null,
      structureTestedAt:
        s.structureHash === structureHash(config) ? s.structureTestedAt : null,
      createdAt: same?.createdAt || new Date().toISOString(),
    };
    store.profile(id, profile);
    store.put("activeModel", {
      profileId: id,
      updatedAt: new Date().toISOString(),
    });
    s.profileKeys ||= new Map();
    if (config.apiKey) s.profileKeys.set(id, config.apiKey);
    s.persistentConfig = {
      ...safe,
      hasKey: Boolean(config.apiKey),
      profileId: id,
      testedAt: profile.testedAt,
      structureTestedAt: profile.structureTestedAt,
    };
    return profile;
  };
  const fullBackups = createFullBackupService({
    dataDir: options.dataDir,
    directory: options.fullBackupDir,
    password: options.fullBackupPassword,
  });
  const jobs = createJobs(store);
  const backups = createBackups(store, {
    directory: options.backupDir,
    keep: options.backupKeep || 30,
  });
  const backupTimer = setInterval(() => {
    if (!jobs.busy) {
      backups.run().catch(() => {});
      fullBackups.run().catch(() => {});
    }
  }, 60000);
  backupTimer.unref();
  const features = featureRoutes({
    store,
    jobs,
    readBody,
    send,
    options,
    publicConfig,
    backups,
  });
  store.purge(store.get("preferences").value?.retentionDays ?? 90);
  const cleanup = setInterval(() => {
    if (!jobs.busy)
      store.purge(store.get("preferences").value?.retentionDays ?? 90);
  }, 86400000);
  cleanup.unref();
  const sessions = new Map();
  const origins = new Set(ORIGINS);
  for (const origin of options.allowedOrigins || []) origins.add(origin);
  if (options.publicOrigin) origins.add(new URL(options.publicOrigin).origin);
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    ...(options.allowedHosts || []),
    ...(options.publicOrigin ? [new URL(options.publicOrigin).hostname] : []),
  ]);
  const serveWeb = options.serveWeb === true;
  const webRoot = resolve(options.webRoot || "dist");
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
    for (const [key, value] of Object.entries(productionHeaders))
      res.setHeader(key, value);
    const host = req.headers.host || "";
    const hostname = host.replace(/:\d+$/, "");
    if (!allowedHosts.has(hostname))
      return send(res, 403, { error: "Host 不被允许" });
    if (
      (req.headers.origin &&
        !origins.has(req.headers.origin) &&
        !(
          serveWeb &&
          !options.publicOrigin &&
          ["localhost", "127.0.0.1"].includes(hostname) &&
          req.headers.origin === `http://${host}`
        )) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(res, 403, { error: "拒绝跨站访问本机 API" });
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/api/ping" && req.method === "GET")
        return send(res, 200, { ok: true });
      if (serveWeb && !path.startsWith("/api/") && path !== "/api")
        return await serveStatic(req, res, webRoot, path);
      if (path === "/api/auth" && req.method === "GET")
        return send(res, 200, {
          required: access.required,
          authenticated: access.authorized(req),
        });
      if (path === "/api/auth/login" && req.method === "POST") {
        await access.login(req, res, await readBody(req));
        return send(res, 200, { ok: true });
      }
      if (!access.authorized(req))
        return send(res, 401, {
          error: "请先登录个人工作区",
          code: "ACCESS_REQUIRED",
        });
      if (path === "/api/auth/logout" && req.method === "POST") {
        const id = (req.headers.cookie || "").match(
          /(?:^|;\s*)evidence_sid=([\w-]+)/,
        )?.[1];
        if (sessions.get(id)?.busy || jobs.busy)
          return send(res, 409, { error: "请等待或取消模型任务再退出" });
        sessions.delete(id);
        access.logout(req, res);
        return send(res, 200, { ok: true });
      }
      if (path === "/api/full-backups") {
        if (req.method === "GET")
          return send(res, 200, await fullBackups.status());
        if (req.method === "POST") {
          if (jobs.busy) throw new InputError("请等待当前模型任务结束");
          return send(res, 200, await fullBackups.run(true));
        }
      }
      if (path === "/api/backups") {
        if (req.method === "GET") return send(res, 200, await backups.status());
        if (req.method === "POST")
          return send(res, 200, await backups.run(true));
        if (req.method === "DELETE")
          return send(res, 200, await backups.clear());
      }
      const backupName = path.match(/^\/api\/backups\/([^/]+)$/)?.[1];
      if (backupName && req.method === "GET")
        return send(res, 200, await backups.read(backupName));
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
          `evidence_sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${options.publicOrigin?.startsWith("https:") ? "; Secure" : ""}`,
        );
      }
      const s = sessions.get(sid);
      await hydratePersistentConfig(s);
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
      if (
        path.startsWith("/api/interview/") &&
        ((store.get("budget").value?.limit || 0) > 0 ||
          Object.values(store.get("routing").value || {}).some(Boolean))
      )
        return send(res, 409, {
          error: "启用模型分工或预算后，请使用可恢复任务接口 /api/jobs",
        });
      if (req.method === "GET" && path === "/api/health")
        return send(res, 200, {
          ok: true,
          config: publicConfig(s) || s.persistentConfig || null,
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
          `evidence_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${options.publicOrigin?.startsWith("https:") ? "; Secure" : ""}`,
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
        if (path === "/api/models") await persistModel(s, config);
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
  server.on("close", async () => {
    clearInterval(cleanup);
    clearInterval(backupTimer);
    await backups.close();
    await fullBackups.close();
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
  const port = Number(process.env.PORT || process.env.API_PORT || 8787);
  const host = process.env.HOST || "127.0.0.1";
  const dataDir = resolve(process.env.DATA_DIR || "data");
  const authFile = resolve(
    process.env.AUTH_FILE || resolve(dataDir, "access.json"),
  );
  const passwordRecord = existsSync(authFile)
    ? JSON.parse(await readFile(authFile, "utf8"))
    : null;
  const publicOrigin = process.env.PUBLIC_ORIGIN || undefined;
  if (
    publicOrigin &&
    (new URL(publicOrigin).protocol !== "https:" ||
      new URL(publicOrigin).origin !== publicOrigin)
  )
    throw new Error("PUBLIC_ORIGIN 请填写不带路径的 HTTPS 地址");
  if (
    !["127.0.0.1", "localhost", "::1"].includes(host) &&
    (!passwordRecord || !publicOrigin)
  )
    throw new Error(
      "对外监听前请设置个人密码及 PUBLIC_ORIGIN，并通过 HTTPS 反向代理访问",
    );
  const list = (value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  createApp({
    dbPath: resolve(dataDir, "evidence.sqlite"),
    dataDir,
    fullBackupDir: process.env.FULL_BACKUP_DIR || undefined,
    fullBackupPassword: process.env.EVIDENCE_BACKUP_PASSPHRASE || undefined,
    passwordRecord,
    publicOrigin,
    backupDir: resolve(process.env.BACKUP_DIR || resolve(dataDir, "backups")),
    webPort: Number(process.env.WEB_PORT || 5173),
    previewPort: Number(process.env.PREVIEW_PORT || 4173),
    allowedHosts: list(process.env.ALLOWED_HOSTS),
    allowedOrigins: list(process.env.ALLOWED_ORIGINS),
    serveWeb: process.env.SERVE_WEB === "1",
    webRoot: resolve(process.env.WEB_ROOT || "dist"),
  })
    .on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? `API 端口 ${port} 已被占用，请调整 API_PORT 后重试。`
          : "API 启动失败：" + error.code,
      );
      process.exitCode = 1;
    })
    .listen(port, host, () =>
      console.log(
        `Evidence Loop ${process.env.SERVE_WEB === "1" ? "app" : "API"} http://${host}:${port}`,
      ),
    );
}
