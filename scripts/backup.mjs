import { resolve } from "node:path";
import { createFullBackup, restoreFullBackup } from "../server/fullBackup.mjs";
const [action, ...args] = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const need = (name) => {
  if (!args.includes(name) || !option(name) || option(name).startsWith("--"))
    throw new Error(`缺少 ${name}`);
  return resolve(option(name));
};
try {
  const password = process.env.EVIDENCE_BACKUP_PASSPHRASE;
  let result;
  if (action === "create")
    result = await createFullBackup(
      args.includes("--data-dir")
        ? need("--data-dir")
        : resolve(process.env.DATA_DIR || "data"),
      need("--output"),
      password,
    );
  else if (action === "verify")
    result = await restoreFullBackup(need("--file"), null, password, {
      verifyOnly: true,
    });
  else if (action === "restore")
    result = await restoreFullBackup(
      need("--file"),
      need("--target"),
      password,
    );
  else
    throw new Error(
      "用法：backup create --output <绝对路径> [--data-dir <目录>] | verify --file <备份> | restore --file <备份> --target <空目录>",
    );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
