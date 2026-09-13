import { access, mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createAccess } from "../server/access.mjs";
const rows = [];
async function check(name, fn) {
  try {
    rows.push({ name, status: "ok", detail: await fn() });
  } catch (e) {
    rows.push({ name, status: "failed", detail: e.message });
    process.exitCode = 1;
  }
}
const data = resolve(process.env.DATA_DIR || "data");
await check("Node.js", async () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw new Error("需要Node22.13+，建议24 LTS");
  return process.versions.node;
});
await check("前端构建", async () => {
  await access(resolve(process.env.WEB_ROOT || "dist", "index.html"));
  return "构建存在";
});
await check("数据目录写入", async () => {
  await mkdir(data, { recursive: true });
  const probe = join(data, `diagnose-${randomUUID()}.tmp`);
  await writeFile(probe, "probe", { flag: "wx", mode: 0o600 });
  await unlink(probe);
  return data;
});
await check("SQLite", async () => {
  const file = join(data, "evidence.sqlite");
  try {
    await access(file);
  } catch {
    return "首次启动时创建";
  }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
      throw new Error("完整性检查失败");
    if (db.prepare("PRAGMA user_version").get().user_version > 1)
      throw new Error("数据来自更新版本，请勿降级直接打开");
    return "完整性通过";
  } finally {
    db.close();
  }
});
await check("远程访问配置", async () => {
  const remote =
    !["127.0.0.1", "localhost", "::1"].includes(
      process.env.HOST || "127.0.0.1",
    ) || Boolean(process.env.PUBLIC_ORIGIN);
  if (!remote) return "本机模式";
  const url = new URL(process.env.PUBLIC_ORIGIN);
  if (url.protocol !== "https:" || url.origin !== process.env.PUBLIC_ORIGIN)
    throw new Error("远程模式需要精确HTTPS PUBLIC_ORIGIN");
  createAccess(
    JSON.parse(
      await readFile(
        process.env.AUTH_FILE || join(data, "access.json"),
        "utf8",
      ),
    ),
  );
  return "HTTPS来源及密码哈希有效";
});
const arg = process.argv.indexOf("--url");
if (arg >= 0)
  await check("运行服务", async () => {
    const url = new URL(process.argv[arg + 1]);
    const r = await fetch(new URL("/api/ping", url), {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!r.ok || (await r.json()).ok !== true)
      throw new Error("健康检查未通过");
    const page = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!page.ok || !(await page.text()).includes("<html"))
      throw new Error("首页不可用");
    return "健康接口和首页可用；模型、HTTPS设备和登录需另行验收";
  });
if (process.argv.includes("--docker"))
  await check("Docker engine", async () => {
    try {
      return execFileSync(
        "docker",
        ["version", "--format", "{{.Server.Version}}"],
        {
          encoding: "utf8",
          timeout: 10000,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      ).trim();
    } catch {
      throw new Error("Docker服务不可达，请启动引擎后再构建验收");
    }
  });
console.log(JSON.stringify({ checks: rows }, null, 2));
