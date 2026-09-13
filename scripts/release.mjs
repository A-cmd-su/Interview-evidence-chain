import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createFullBackup, restoreFullBackup } from "../server/fullBackup.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [action, ...args] = process.argv.slice(2);
const get = (name) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error(`缺少 ${name}`);
  return args[i + 1];
};
function run(command, args, cwd = root) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error || r.status !== 0)
    throw new Error(
      `${command} 执行失败：${r.error?.message || r.stderr?.slice(-1800)}`,
    );
  return r.stdout.trim();
}
async function build(target) {
  const npmCli =
    process.env.npm_execpath ||
    join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  await access(npmCli);
  run(process.execPath, [npmCli, "ci"], target);
  run(process.execPath, [npmCli, "run", "build"], target);
}
try {
  const target = resolve(get("--destination")),
    rel = relative(root, target);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error("发布目录必须位于当前项目之外，避免覆盖运行中的代码或数据");
  if (!["stage", "rollback"].includes(action))
    throw new Error(
      "用法：release stage --ref <已获取的提交> --destination <新目录> [--data-dir <目录>] | rollback --manifest <发布清单> --destination <新目录>",
    );
  const password = process.env.EVIDENCE_BACKUP_PASSPHRASE;
  if (!password || password.length < 12)
    throw new Error("请先设置 EVIDENCE_BACKUP_PASSPHRASE（至少12字符）");
  if (action === "stage") {
    if (run("git", ["status", "--porcelain"]))
      throw new Error("请先提交当前代码，升级前工作区必须干净");
    const revision = run("git", [
      "rev-parse",
      "--verify",
      `${get("--ref")}^{commit}`,
    ]);
    const previous = run("git", ["rev-parse", "HEAD"]);
    const data = args.includes("--data-dir")
      ? resolve(get("--data-dir"))
      : resolve(process.env.DATA_DIR || join(root, "data"));
    await mkdir(target, { recursive: false });
    const backup = join(target, "before-data.iecbackup"),
      archive = join(target, "before-code.tar");
    await createFullBackup(data, backup, password);
    await restoreFullBackup(backup, null, password, { verifyOnly: true });
    run("git", ["archive", "--format=tar", `--output=${archive}`, previous]);
    const app = join(target, "app");
    await mkdir(app);
    const source = join(target, "release-code.tar");
    run("git", ["archive", "--format=tar", `--output=${source}`, revision]);
    run("tar", ["-xf", source, "-C", app]);
    await build(app);
    await restoreFullBackup(backup, join(target, "data"), password);
    const manifest = {
      format: "evidence-release-1",
      createdAt: new Date().toISOString(),
      previous,
      revision,
      archive,
      backup,
      app,
      data: join(target, "data"),
      state: "staged",
    };
    await writeFile(
      join(target, "release.json"),
      JSON.stringify(manifest, null, 2),
      { flag: "wx" },
    );
    console.log(
      `发布已准备：${join(target, "release.json")}。原服务未切换。请先用新端口验收，再更新服务启动目录与 DATA_DIR。`,
    );
  } else {
    const manifest = JSON.parse(
      await readFile(resolve(get("--manifest")), "utf8"),
    );
    if (manifest.format !== "evidence-release-1")
      throw new Error("发布清单版本无效");
    await restoreFullBackup(manifest.backup, null, password, {
      verifyOnly: true,
    });
    await mkdir(target, { recursive: false });
    const app = join(target, "app");
    await mkdir(app);
    run("tar", ["-xf", manifest.archive, "-C", app]);
    await build(app);
    await restoreFullBackup(manifest.backup, join(target, "data"), password);
    console.log(
      `回滚版本与升级前数据已恢复到 ${target}。请验收后切换服务；升级后的新记录仍保留在原目录，不会自动合并。`,
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
