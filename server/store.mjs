import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { InputError } from "../shared/analyze.mjs";

export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function validateWorkspace(w) {
  if (
    !w ||
    w.version !== 2 ||
    typeof w.draft?.jd !== "string" ||
    typeof w.draft?.resume !== "string" ||
    !Array.isArray(w.records) ||
    !Array.isArray(w.sessions) ||
    !w.done ||
    typeof w.done !== "object"
  )
    throw new InputError("工作区格式或版本不正确");
  if (
    w.draft.jd.length > 20000 ||
    w.draft.resume.length > 20000 ||
    w.records.length > 10000
  )
    throw new InputError("工作区超过容量限制");
  const checkSession = (s) => {
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.title !== "string" ||
      typeof s.jd !== "string" ||
      typeof s.resume !== "string" ||
      !Array.isArray(s.questions) ||
      !Array.isArray(s.capabilities)
    )
      throw new InputError("面试记录结构不完整");
    for (const q of s.questions)
      if (!q || typeof q.id !== "string" || typeof q.question !== "string")
        throw new InputError("问题记录不完整");
  };
  w.sessions.forEach(checkSession);
  if (w.session) {
    checkSession(w.session);
    if (
      !Number.isInteger(w.session.current) ||
      !w.session.questions[w.session.current] ||
      w.session.questions.some((q) => !Array.isArray(q.attempts))
    )
      throw new InputError("当前面试进度无效");
  }
  const ids = new Set();
  const text = (value, label, max = 20000) => {
    if (typeof value !== "string" || value.length > max)
      throw new InputError(`备份的${label}格式错误`);
  };
  const span = (value, source) => {
    if (
      !value ||
      typeof source !== "string" ||
      typeof value.quote !== "string" ||
      !value.quote ||
      !Number.isInteger(value.start) ||
      !Number.isInteger(value.end) ||
      value.start < 0 ||
      value.end !== value.start + value.quote.length ||
      source.slice(value.start, value.end) !== value.quote
    )
      throw new InputError("备份中的证据原文位置不匹配");
  };
  for (const r of w.records) {
    if (
      !r ||
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      typeof r.input?.question !== "string" ||
      typeof r.input?.answer !== "string" ||
      typeof r.input?.jd !== "string" ||
      typeof r.input?.resume !== "string" ||
      !Array.isArray(r.scores) ||
      !Array.isArray(r.missing) ||
      !Array.isArray(r.consistency) ||
      !Array.isArray(r.trainingPlan?.tasks)
    )
      throw new InputError("报告记录损坏或 ID 重复");
    ids.add(r.id);
    if (
      r.scores.some(
        (s) =>
          !s ||
          typeof s.dimension !== "string" ||
          typeof s.rubric?.id !== "string",
      )
    )
      throw new InputError("评分量表记录缺失");
    text(r.createdAt, "报告时间", 100);
    if (
      r.score !== null &&
      (!Number.isFinite(r.score) || r.score < 0 || r.score > 100)
    )
      throw new InputError("报告总分格式错误");
    if (r.input.history !== undefined && !Array.isArray(r.input.history))
      throw new InputError("历史回答格式错误");
    const turns = [...(r.input.history || []), r.input];
    for (const turn of turns) {
      text(turn.question, "问题", 2000);
      text(turn.answer, "回答", 8000);
    }
    text(r.trainingPlan.title, "训练标题", 150);
    text(r.trainingPlan.reason, "训练原因", 2000);
    text(r.trainingPlan.dueAt, "复测日期", 100);
    for (const task of r.trainingPlan.tasks) {
      for (const key of ["id", "gap", "title", "prompt", "criterion"])
        text(task?.[key], "训练任务", 2000);
    }
    for (const score of r.scores) {
      if (
        score.score !== null &&
        (!Number.isInteger(score.score) || score.score < 0 || score.score > 5)
      )
        throw new InputError("报告维度分数格式错误");
      text(score.note, "评分说明", 3000);
      text(score.rubric.text, "量表", 10000);
      text(score.rubric.title, "量表名称", 200);
      if (score.evidence) {
        span(score.evidence.answer, turns[score.evidence.answer?.turn]?.answer);
        span(score.evidence.requirement, r.input.jd);
      }
    }
    for (const c of r.consistency) {
      text(c?.reason, "澄清理由", 2000);
      text(c?.question, "澄清问题", 2000);
      span(c.answer, r.input.answer);
      span(
        c.claim,
        c.source === "resume"
          ? r.input.resume
          : r.input.history?.[c.turn]?.answer,
      );
    }
    if (r.followUp) {
      text(r.followUp.question, "追问", 2000);
      text(r.followUp.gap, "追问缺口", 100);
    }
    if (r.trainingVerification) {
      text(r.trainingVerification.reason, "验收理由", 4000);
      text(r.trainingVerification.quote, "验收证据", 8000);
      if (
        typeof r.trainingVerification.passed !== "boolean" ||
        (r.trainingVerification.quote &&
          !r.input.answer.includes(r.trainingVerification.quote))
      )
        throw new InputError("训练验收引用无效");
    }
  }
  for (const s of [w.session, ...w.sessions].filter(Boolean)) {
    for (const c of s.capabilities) {
      text(c?.label, "能力标签", 100);
      span(c, s.jd);
    }
    for (const q of s.questions)
      for (const turn of q.attempts || []) {
        if (!ids.has(turn.reportId))
          throw new InputError("问题引用了不存在的报告");
        text(turn.answer, "历史回答", 8000);
        text(turn.question, "历史问题", 2000);
      }
  }
  // Reject credentials and prototype keys recursively, including imported unknown fields.
  const walk = (v, depth = 0) => {
    if (depth > 40) throw new InputError("数据嵌套过深");
    if (v && typeof v === "object")
      for (const [k, item] of Object.entries(v)) {
        if (
          /^(apiKey|authorization|password|__proto__|constructor|prototype)$/i.test(
            k,
          )
        )
          throw new InputError("备份不得包含凭据或危险字段");
        walk(item, depth + 1);
      }
  };
  walk(w);
  return w;
}

export function createStore(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (db.prepare("PRAGMA user_version").get().user_version > 1) {
    db.close();
    throw new Error("数据库来自更新版本，请使用匹配版本的应用，未修改数据");
  }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS kv (id TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, value TEXT NOT NULL, created INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  const get = (id) => {
    const r = db.prepare("SELECT * FROM kv WHERE id=?").get(id);
    return {
      value: r ? JSON.parse(r.value) : null,
      revision: r?.revision || 0,
    };
  };
  const put = (id, value, revision) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const old = get(id);
      if (revision !== undefined && revision !== old.revision) {
        const e = new InputError("记录已被其他页面修改，请刷新后重试");
        e.status = 409;
        throw e;
      }
      const next = old.revision + 1;
      db.prepare(
        "INSERT INTO kv(id,value,revision) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=excluded.revision",
      ).run(id, JSON.stringify(value), next);
      db.exec("COMMIT");
      return next;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const saveJob = (j) =>
    db
      .prepare(
        "INSERT INTO jobs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated=excluded.updated",
      )
      .run(j.id, j.fingerprint, JSON.stringify(j), Date.now());
  const jobs = () =>
    db
      .prepare("SELECT value FROM jobs ORDER BY updated DESC")
      .all()
      .map((r) => JSON.parse(r.value));
  for (const j of jobs())
    if (["running", "queued"].includes(j.status))
      saveJob({
        ...j,
        status: "interrupted",
        error: "服务已重启，原请求状态不可确认；不会自动重发，以免重复计费。",
        finishedAt: new Date().toISOString(),
      });
  const purge = (days) => {
    if (!days) return;
    const cutoff = Date.now() - days * 86400000;
    const { value: w } = get("workspace");
    if (w) {
      const expired = new Set(
        [w.session, ...w.sessions]
          .filter((s) => s && Date.parse(s.createdAt) < cutoff)
          .map((s) => s.id),
      );
      const records = w.records.filter(
        (r) => !expired.has(r.sessionId) && Date.parse(r.createdAt) >= cutoff,
      );
      const keep = new Set(records.map((r) => r.id));
      put("workspace", {
        ...w,
        session: expired.has(w.session?.id) ? null : w.session,
        sessions: w.sessions.filter((s) => !expired.has(s.id)),
        records,
        selected: keep.has(w.selected) ? w.selected : null,
        done: Object.fromEntries(
          Object.entries(w.done).filter(([k]) => keep.has(k.split(":")[0])),
        ),
        draft:
          Date.parse(w.updatedAt) < cutoff
            ? { jd: "", resume: "", difficulty: "standard" }
            : w.draft,
        preparation: Date.parse(w.updatedAt) < cutoff ? null : w.preparation,
      });
    }
    db.prepare("DELETE FROM jobs WHERE updated < ?").run(cutoff);
    db.prepare("DELETE FROM usage WHERE created < ?").run(cutoff);
  };
  return {
    get,
    put,
    purge,
    saveJob,
    jobs,
    job: (id) => {
      const r = db.prepare("SELECT value FROM jobs WHERE id=?").get(id);
      return r ? JSON.parse(r.value) : null;
    },
    deleteJobs: (ids) => {
      const stmt = db.prepare("DELETE FROM jobs WHERE id=?");
      for (const id of ids) stmt.run(id);
    },
    profiles: () =>
      db
        .prepare("SELECT value FROM profiles")
        .all()
        .map((r) => JSON.parse(r.value)),
    profile: (id, value) =>
      db
        .prepare(
          "INSERT INTO profiles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
        )
        .run(id, JSON.stringify(value)),
    deleteProfile: (id) =>
      db.prepare("DELETE FROM profiles WHERE id=?").run(id),
    addUsage: (value) =>
      db
        .prepare("INSERT INTO usage(value,created) VALUES(?,?)")
        .run(JSON.stringify(value), Date.now()),
    usage: () =>
      db
        .prepare("SELECT value FROM usage ORDER BY id DESC LIMIT 2000")
        .all()
        .map((r) => JSON.parse(r.value)),
    backup: () => {
      const value = get("workspace").value;
      return {
        format: "evidence-backup-1",
        exportedAt: new Date().toISOString(),
        checksum: digest(value),
        workspace: value,
      };
    },
    restore: (body) => {
      if (
        body?.format !== "evidence-backup-1" ||
        body.checksum !== digest(body.workspace)
      )
        throw new InputError("备份版本或 SHA-256 校验失败，未修改数据");
      const w = validateWorkspace(body.workspace);
      return put("workspace", w);
    },
    clear: () =>
      db.exec(
        "DELETE FROM kv WHERE id='workspace'; DELETE FROM jobs; DELETE FROM usage; PRAGMA wal_checkpoint(TRUNCATE);",
      ),
    close: () => db.close(),
  };
}
