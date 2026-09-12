# 个人上线

当前产品按单用户设计。最稳妥的上线方式是把完整应用部署到一台你自己的机器或带持久卷的 VPS，再用 Tailscale、Cloudflare Access 或 VPN 限制访问。不要把 API 端口直接暴露到公网，也不要把模型 Key 写进环境文件后提交仓库。

## Docker 部署

在服务器上执行：

```bash
git clone https://github.com/A-cmd-su/Interview-evidence-chain.git
cd Interview-evidence-chain
cp .env.example .env
# 编辑 .env，将 ALLOWED_HOSTS/ALLOWED_ORIGINS 改为实际访问地址
docker build -t interview-evidence-chain .
docker run -d --name interview-evidence-chain \
  --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:8787:8787 \
  -v interview-evidence-data:/app/data \
  interview-evidence-chain
```

容器内的 Node 服务同时提供前端和 `/api`，SQLite 位于持久卷 `/app/data`。如果使用反向代理，代理到 `127.0.0.1:8787`，并将实际域名分别填入 `ALLOWED_HOSTS` 和 `ALLOWED_ORIGINS`。如果使用私有隧道，仍应在隧道侧开启身份保护；应用本身没有账号系统。

## 本机上线

```powershell
$env:HOST = "127.0.0.1"
$env:PORT = "8787"
$env:SERVE_WEB = "1"
npm ci
npm run build
npm run server
```

浏览器访问 `http://127.0.0.1:8787`。生产模式不需要 Skill、MCP、Vite 或开发服务器。

## 更新和备份

更新前在“历史与设置”导出带校验备份，并复制整个 `data` 目录。更新时重新构建镜像，保留同一个数据卷。模型配置中的 Key 不会进入备份；换机器需重新配置模型。

上线验收至少包括：访问首页、保存并测试真实模型、提取 JD、生成问题、回答评分、追问、打印报告、刷新恢复，以及确认手机端摄像头/麦克风权限。视频只在浏览器页面生成 Blob，评分请求只发送确认后的文字。

Vercel 只适合部署静态前端，不能直接承载本项目的 SQLite 持久盘、单用户会话和 Windows 凭据管理；若改用 Vercel，API 必须另行部署到带持久存储的服务，并重新设计认证和跨域策略。
