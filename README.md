# Interview Evidence Chain

基于岗位要求与个人经历的可追溯 AI 面试训练平台 MVP。

## 快速开始

```bash
npm install
npm run dev
```

当前版本默认使用离线演示数据；在「模型设置」中可配置 OpenAI-compatible API 的 Base URL、API Key 和模型名称。API Key 仅用于本地浏览器演示，不要提交到 Git。

## MVP 能力

- JD 与简历能力标签提取（演示数据）
- 基于回答缺失项的动态追问
- 关联回答片段、岗位要求、知识库依据的证据评分
- 简历主张与回答的待澄清提示
- 个性化训练计划和复测安排
- 在线 / 规则 / 预置案例三种模式切换
