import { randomUUID } from "node:crypto";
import { credential } from "../server/credentials.mjs";
const id = "smoke-" + randomUUID();
const secret = randomUUID();
try {
  await credential("set", id, secret);
  if ((await credential("get", id)).secret !== secret)
    throw new Error("凭据读取不匹配");
  await credential("delete", id);
  if ((await credential("get", id)).secret !== null)
    throw new Error("凭据删除验证失败");
  console.log("Windows 凭据管理器写入、读取、删除验证通过；测试凭据已删除。");
} finally {
  await credential("delete", id).catch(() => {});
}
