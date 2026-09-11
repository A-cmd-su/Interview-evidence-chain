import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
export function credential(action, id, secret) {
  if (process.platform !== "win32")
    return Promise.reject(
      new Error(
        "长期 Key 保存目前支持 Windows 凭据管理器；本机可继续使用会话 Key。",
      ),
    );
  if (!/^[\w-]{1,80}$/.test(id))
    return Promise.reject(new Error("配置 ID 无效"));
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        fileURLToPath(new URL("./credentials.ps1", import.meta.url)),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on("data", (b) => {
      output += b.toString();
    });
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("系统凭据存储不可用，Key 未保存"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code) reject(new Error("系统凭据存储操作失败，Key 未写入配置文件"));
      else {
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new Error("系统凭据返回格式无效"));
        }
      }
    });
    child.stdin.end(JSON.stringify({ action, id, secret }));
  });
}
