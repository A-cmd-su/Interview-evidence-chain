# 个人上线

当前产品按单用户设计。最稳妥的上线方式是把完整应用部署到一台你自己的机器或带持久卷的 VPS，再用 Tailscale、Cloudflare Access 或 VPN 限制访问。不要把 API 端口直接暴露到公网，也不要把模型 Key 写进环境文件后提交仓库。

## Docker 部署

在服务器上执行：

```bash
git clone https://github.com/A-cmd-su/Interview-evidence-chain.git
cd Interview-evidence-chain
cp .env.example .env
# 编辑 .env，将 PUBLIC_ORIGIN 改为实际 HTTPS 地址，例如 https://interview.example.com
docker build -t interview-evidence-chain .
docker run --rm -it --env-file .env -v interview-evidence-data:/app/data \
  interview-evidence-chain node scripts/set-password.mjs
docker run -d --name interview-evidence-chain \
  --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:8787:8787 \
  -v interview-evidence-data:/app/data \
  interview-evidence-chain
```

容器内的 Node 服务同时提供前端和 `/api`，SQLite 位于持久卷 `/app/data`。镜像使用 Node 24、非 root 用户、多阶段构建和健康检查。请将 HTTPS 反向代理指向 `127.0.0.1:8787`；`PUBLIC_ORIGIN` 必须与浏览器访问的 HTTPS 来源完全一致，不带路径或尾部斜杠。应用提供单人密码登录，无注册或多人账号系统；同时可以使用 Tailscale / Cloudflare Access 限制访问。

密码至少12字符，交互设置时不回显。`data/access.json` 仅保存 scrypt 加盐摘要，模型Key不使用这个密码文件。登录Cookie有效8小时；HTTPS模式下附带 Secure、HttpOnly 和 SameSite=Strict。短时间连续失败会限流；服务器重启会使访问会话失效。修改密码后重启服务生效。

未设置密码和 HTTPS 来源时，对外监听会拒绝启动。保持 Docker 端口只映射到宿主机 loopback，在反向代理层终止 TLS。Caddy 示例（域名需已解析至服务器）：

```caddyfile
interview.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

摄像头与麦克风在远程访问时需要 HTTPS。`/api/ping` 仅返回可用状态，适合容器健康检查；历史、配置、备份、任务和用量接口均受登录保护。当前没有多用户数据隔离，不应作为多人托管服务部署。

## 本机上线

```powershell
$env:HOST = "127.0.0.1"
$env:PORT = "8787"
$env:SERVE_WEB = "1"
npm ci
npm run build
# 可选：本机也启用密码；远程部署必需
npm run set-password
npm run server
```

浏览器访问 `http://127.0.0.1:8787`。生产模式不需要 Skill、MCP、Vite 或开发服务器。

## 更新和备份

更新前在“历史与设置”导出带校验备份。复制整个 `data` 目录前停止服务，避免漏复制 WAL。更新时重新构建镜像，保留同一个数据卷。模型配置中的 Key 不会进入工作区备份；换机器需重新配置模型。Linux 容器目前使用会话Key，尚不支持 Windows 凭据管理器。

服务每分钟检查备份是否到期，有工作区时每天创建一份 JSON 快照，默认保留30份。写入临时文件并校验后才替换为正式备份；不直接复制正在写入的 SQLite 文件。默认位置 `data/backups`，可以通过 `BACKUP_DIR` 改为独立持久卷。页面支持立即备份、下载、明确确认后清理。导入前会先校验输入，并尝试备份当前工作区；备份失败则中止导入。

这些JSON快照包含工作区、面试和报告，不包含配置档案、Key及调用用量。需要全部SQLite记录时，使用`npm run backup`或配置`FULL_BACKUP_DIR`启用每天的加密完整快照，步骤见[维护说明](OPERATIONS.md)。完整快照支持一致性在线导出，不需要直接复制WAL文件；API Key仍不导出。删除记录不会删除已有快照，外部副本需要单独管理。数据库启动时执行完整性快速检查，损坏时拒绝继续写入。

上线验收至少包括：访问首页、保存并测试真实模型、提取 JD、生成问题、回答评分、追问、打印报告、刷新恢复，以及确认手机端摄像头/麦克风权限。视频只在浏览器页面生成 Blob，评分请求只发送确认后的文字。

镜像含`backup`与`diagnose`工具。完整备份目录若放在容器外，需额外挂载持久卷，并允许容器中的`node`用户写入；为服务注入独立备份口令，避免将口令打进镜像。可先执行`npm run diagnose -- --url http://127.0.0.1:8787`检查启动情况。

Vercel 只适合部署静态前端，不能直接承载本项目的 SQLite 持久盘、单用户会话和 Windows 凭据管理；若改用 Vercel，API 必须另行部署到带持久存储的服务，并重新设计认证和跨域策略。
