import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  mkdtemp,
  rm,
  readdir,
  copyFile,
  unlink,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { validateWorkspace } from "./store.mjs";

export function createFullBackupService({
  dataDir,
  directory,
  password,
  keep = 30,
} = {}) {
  if (directory && (!password || password.length < 12))
    throw new Error(
      "配置完整备份目录后必须设置至少12字符的 EVIDENCE_BACKUP_PASSPHRASE",
    );
  const root = directory ? resolve(directory) : null,
    pattern = /^full-(\d{13})-[a-f0-9-]{36}\.iecbackup$/;
  let pending = null,
    error = null,
    closed = false;
  async function files() {
    if (!root) return [];
    await mkdir(root, { recursive: true });
    return (await readdir(root))
      .filter((n) => pattern.test(n))
      .sort()
      .reverse();
  }
  async function status() {
    const names = await files();
    return {
      enabled: Boolean(root),
      directory: root,
      keep,
      lastSuccessfulAt: names[0]
        ? new Date(Number(names[0].match(pattern)[1])).toISOString()
        : null,
      count: names.length,
      error,
    };
  }
  async function run(force = false) {
    if (!root || closed) return status();
    if (pending) return pending;
    pending = (async () => {
      const names = await files();
      if (
        !force &&
        names[0] &&
        Date.now() - Number(names[0].match(pattern)[1]) < 86400000
      )
        return status();
      try {
        const name = `full-${Date.now()}-${randomUUID()}.iecbackup`,
          file = join(root, name);
        await createFullBackup(dataDir, file, password);
        await restoreFullBackup(file, null, password, { verifyOnly: true });
        error = null;
        const current = await files();
        for (const old of current.slice(keep)) await unlink(join(root, old));
      } catch {
        error = "完整备份失败，请检查目标卷、空间、权限和口令；原数据未修改";
      }
      return status();
    })().finally(() => {
      pending = null;
    });
    return pending;
  }
  return {
    status,
    run,
    close: async () => {
      closed = true;
      await pending;
    },
  };
}
const hash = (b) => createHash("sha256").update(b).digest("hex");
function verifyDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (
      db.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
      db.prepare("PRAGMA user_version").get().user_version !== 1
    )
      throw new Error("数据库完整性或版本校验失败");
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    if (!["kv", "profiles", "jobs", "usage"].every((n) => names.includes(n)))
      throw new Error("数据库表不完整");
    const row = db.prepare("SELECT value FROM kv WHERE id='workspace'").get();
    if (row) validateWorkspace(JSON.parse(row.value));
  } finally {
    db.close();
  }
}
function key(password, salt) {
  if (typeof password !== "string" || password.length < 12)
    throw new Error(
      "请通过 EVIDENCE_BACKUP_PASSPHRASE 提供至少12字符的备份口令",
    );
  return scryptSync(password, salt, 32);
}
export async function createFullBackup(dataDir, destination, password) {
  const salt = randomBytes(16),
    iv = randomBytes(12),
    secret = key(password, salt);
  const temp = await mkdtemp(join(tmpdir(), "evidence-full-"));
  try {
    const snapshot = join(temp, "evidence.sqlite"),
      source = new DatabaseSync(join(resolve(dataDir), "evidence.sqlite"), {
        readOnly: true,
      });
    try {
      source.prepare("VACUUM INTO ?").run(snapshot);
    } finally {
      source.close();
    }
    verifyDatabase(snapshot);
    const db = await readFile(snapshot);
    let access = null;
    try {
      access = JSON.parse(await readFile(join(dataDir, "access.json"), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const payload = Buffer.from(
      JSON.stringify({
        format: "evidence-full-1",
        createdAt: new Date().toISOString(),
        database: db.toString("base64"),
        checksum: hash(db),
        access,
      }),
    );
    const cipher = createCipheriv("aes-256-gcm", secret, iv),
      encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    const envelope = {
      format: "evidence-encrypted-1",
      kdf: "scrypt",
      cipher: "aes-256-gcm",
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      data: encrypted.toString("base64"),
    };
    await mkdir(dirname(resolve(destination)), { recursive: true });
    await writeFile(destination, JSON.stringify(envelope), {
      flag: "wx",
      mode: 0o600,
    });
    return {
      path: resolve(destination),
      checksum: hash(await readFile(destination)),
      scope:
        "SQLite 全部记录、配置与个人密码哈希；不包含系统凭据中的模型 Key、媒体、外部备份或 TLS 私钥",
    };
  } finally {
    secret.fill(0);
    await rm(temp, { recursive: true, force: true });
  }
}
export async function restoreFullBackup(
  file,
  target,
  password,
  { verifyOnly = false } = {},
) {
  const stat = await import("node:fs/promises").then((m) => m.stat(file));
  if (stat.size > 300 * 1024 * 1024) throw new Error("备份超过300MB限制");
  const envelope = JSON.parse(await readFile(file, "utf8"));
  if (
    envelope.format !== "evidence-encrypted-1" ||
    envelope.kdf !== "scrypt" ||
    envelope.cipher !== "aes-256-gcm" ||
    !/^[a-f0-9]{32}$/.test(envelope.salt) ||
    !/^[a-f0-9]{24}$/.test(envelope.iv) ||
    !/^[a-f0-9]{32}$/.test(envelope.tag)
  )
    throw new Error("加密备份头无效");
  const secret = key(password, Buffer.from(envelope.salt, "hex"));
  let payload;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secret,
      Buffer.from(envelope.iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
    payload = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new Error("备份口令错误或内容被修改，未恢复");
  } finally {
    secret.fill(0);
  }
  const bytes = Buffer.from(payload.database || "", "base64");
  if (payload.format !== "evidence-full-1" || hash(bytes) !== payload.checksum)
    throw new Error("数据库校验失败，未恢复");
  const temp = await mkdtemp(join(tmpdir(), "evidence-verify-"));
  try {
    const dbFile = join(temp, "evidence.sqlite");
    await writeFile(dbFile, bytes, { mode: 0o600 });
    verifyDatabase(dbFile);
    if (payload.access) {
      const { createAccess } = await import("./access.mjs");
      createAccess(payload.access);
    }
    if (!verifyOnly) {
      const destination = resolve(target);
      try {
        if ((await readdir(destination)).length)
          throw new Error("恢复目录必须为空，当前数据未改动");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      await mkdir(destination, { recursive: true });
      await copyFile(dbFile, join(destination, "evidence.sqlite"), 1);
      if (payload.access)
        await writeFile(
          join(destination, "access.json"),
          JSON.stringify(payload.access),
          { flag: "wx", mode: 0o600 },
        );
    }
    return {
      verified: true,
      createdAt: payload.createdAt,
      ...(!verifyOnly ? { directory: resolve(target) } : {}),
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
