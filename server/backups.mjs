import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { digest, validateWorkspace } from "./store.mjs";
import { InputError } from "../shared/analyze.mjs";

const namePattern = /^workspace-\d{13}-[a-f0-9-]{36}\.json$/;
export function validateBackup(value) {
  if (
    value?.format !== "evidence-backup-1" ||
    value.checksum !== digest(value.workspace)
  )
    throw new InputError("备份校验失败");
  validateWorkspace(value.workspace);
  return value;
}
export function createBackups(store, { directory, keep = 30 } = {}) {
  let pending = null,
    error = null,
    closed = false;
  const root = directory ? resolve(directory) : null;
  const files = async () => {
    if (!root) return [];
    await mkdir(root, { recursive: true, mode: 0o700 });
    return (await readdir(root))
      .filter((n) => namePattern.test(n))
      .sort()
      .reverse();
  };
  const read = async (name) => {
    if (!root || !namePattern.test(name)) throw new Error("备份名称无效");
    return validateBackup(
      JSON.parse(await readFile(resolve(root, name), "utf8")),
    );
  };
  const status = async () => {
    const names = await files();
    return {
      enabled: Boolean(root),
      directory: root,
      keep,
      error,
      lastSuccessfulAt: names[0]
        ? new Date(Number(names[0].slice(10, 23))).toISOString()
        : null,
      files: names,
      scope: "工作区、面试和报告；不含模型Key、配置档案及用量",
    };
  };
  return {
    status,
    read,
    async close() {
      closed = true;
      if (pending) await pending;
    },
    async run(force = false) {
      if (closed) return;
      if (!root) return status();
      if (pending) return pending;
      pending = (async () => {
        let temp;
        try {
          const names = await files();
          if (closed) return;
          if (
            !force &&
            names[0] &&
            Date.now() - Number(names[0].slice(10, 23)) < 86400000
          )
            return;
          // Capture synchronously before filesystem I/O; WAL may continue changing safely.
          const snapshot = store.backup();
          if (!snapshot.workspace) return;
          const content = JSON.stringify(validateBackup(snapshot));
          const name = `workspace-${Date.now()}-${randomUUID()}.json`;
          temp = resolve(root, name + ".tmp");
          await writeFile(temp, content, { flag: "wx", mode: 0o600 });
          validateBackup(JSON.parse(await readFile(temp, "utf8")));
          await rename(temp, resolve(root, name));
          temp = null;
          for (const old of (await files()).slice(keep))
            await unlink(resolve(root, old));
          error = null;
        } catch {
          error = "自动备份失败：请检查数据目录空间与写入权限，现有备份保留";
        } finally {
          if (temp) await unlink(temp).catch(() => {});
        }
      })();
      try {
        await pending;
        return await status();
      } finally {
        pending = null;
      }
    },
    async clear() {
      if (pending) await pending;
      for (const name of await files()) await unlink(resolve(root, name));
      error = null;
      return status();
    },
  };
}
