import net from "node:net";
const major = Number(process.versions.node.split(".")[0]);
if (
  major < 22 ||
  (major === 22 && Number(process.versions.node.split(".")[1]) < 13)
) {
  console.error("需要 Node.js 22.13 或更新版本（建议 Node 24 LTS）。");
  process.exit(1);
}
if (
  process.env.HOST &&
  !["localhost", "127.0.0.1"].includes(process.env.HOST)
) {
  console.error("当前交付仅支持本机单用户，不能配置公开监听地址。");
  process.exit(1);
}
for (const [name, fallback] of [
  ["API_PORT", 8787],
  ["WEB_PORT", 5173],
]) {
  const port = Number(process.env[name] || fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error(`${name} 需为1024–65535整数`);
    process.exit(1);
  }
  await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (e) => {
      console.error(
        e.code === "EADDRINUSE"
          ? `${name}=${port} 已占用，请更改该环境变量后重试。`
          : `无法使用 ${name}=${port}：${e.code}`,
      );
      process.exitCode = 1;
      resolve();
    });
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
