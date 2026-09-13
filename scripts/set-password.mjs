import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { passwordRecord } from "../server/access.mjs";

const output = new Writable({
  write(chunk, encoding, callback) {
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
try {
  if (!process.stdin.isTTY)
    throw new Error("请在自己的交互终端运行，密码不会回显");
  process.stdout.write("设置个人访问密码（至少12字符，输入不回显）：");
  const password = await rl.question("");
  process.stdout.write("\n再次输入：");
  if (password !== (await rl.question("")))
    throw new Error("两次密码不同，未保存");
  const record = await passwordRecord(password);
  const path = resolve(
    process.env.AUTH_FILE ||
      resolve(process.env.DATA_DIR || "data", "access.json"),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(record), { mode: 0o600 });
  process.stdout.write(
    "\n已保存加盐密码摘要。重启应用后生效；原访问会话随重启失效。\n",
  );
} catch (e) {
  console.error("\n" + e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
