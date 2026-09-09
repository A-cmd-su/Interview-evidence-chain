# Interview Evidence Chain

基于岗位要求与个人经历的可追溯 AI 面试训练平台 MVP。

## 快速开始

```bash
npm install
npm run dev
```

当前版本仅使用在线模型分析；在「模型设置」中可配置 OpenAI-compatible API 的 Base URL、API Key 和模型名称。支持填写 API 根地址（如 `/v1`）或完整 `/chat/completions` 地址。API Key 仅保存在本地后端会话内存，不要提交到 Git。启动时请使用 `npm run dev`，它会同时启动 Vite 前端和本地 API。

## MVP 能力

- JD 与简历能力标签提取（演示数据）
- 基于回答缺失项的动态追问
- 关联回答片段、岗位要求、知识库依据的证据评分
- 简历主张与回答的待澄清提示
- 个性化训练计划和复测安排
- 在线模型语义观察 + 固定证据量表校验
- OpenAI-compatible 云模型、中转服务、Ollama / LM Studio 配置
