import React from "react";
import { ArrowRight, Upload, CheckCheck, ScanText, Route } from "lucide-react";

export function Workspace({
  draft,
  update,
  config,
  start,
  busy,
  error,
  importFile,
  consent,
  setConsent,
  configure,
  session,
  resume,
  records,
  openReport,
}) {
  return (
    <div className="page">
      <section className="intro">
        <div>
          <span className="number-label">01 / A BETTER NEXT ANSWER</span>
          <h2>
            把每一次回答，
            <br />
            <em>变成进步的证据。</em>
          </h2>
          <p>
            从你想去的岗位出发，找出经历中的关键证据。让下一次面试，更具体、更有说服力。
          </p>
          <button className="primary" onClick={start} disabled={Boolean(busy)}>
            {busy === "prepare" ? "模型正在设计面试…" : "生成我的面试路径"}
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="intro-stat">
          <div className="chain-visual" aria-hidden="true">
            <span>
              <ScanText />
            </span>
            <i />
            <span>
              <Route />
            </span>
            <i />
            <span>
              <CheckCheck />
            </span>
          </div>
          <strong>ANSWER → EVIDENCE</strong>
          <span>回答原文 · 岗位要求 · 评分量表</span>
          <button onClick={configure} disabled={Boolean(busy)}>
            {config ? "已配置 " + config.model : "先连接你的模型"} ↗
          </button>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAKE IT PERSONAL</span>
          <h3>这次，你在准备什么岗位？</h3>
        </div>
        <span className="required">不限行业与技术栈</span>
      </div>
      <fieldset disabled={Boolean(busy)} className="input-grid">
        <div className="field">
          <label htmlFor="jd">
            岗位 JD <small>{draft.jd.length} / 20000</small>
          </label>
          <textarea
            id="jd"
            value={draft.jd}
            maxLength={20000}
            onChange={(e) => update("jd", e.target.value)}
            placeholder="粘贴岗位职责、能力要求和加分项…"
          />
        </div>
        <div className="field">
          <label htmlFor="resume">
            个人简历 <small>{draft.resume.length} / 20000</small>
          </label>
          <textarea
            id="resume"
            value={draft.resume}
            maxLength={20000}
            onChange={(e) => update("resume", e.target.value)}
            placeholder="粘贴项目经历，或导入你的简历文件…"
          />
          <label className="upload">
            <Upload size={16} />
            {busy === "import" ? "正在提取文本…" : "导入简历"}
            <input
              type="file"
              accept=".txt,.md,.pdf,.docx"
              onChange={importFile}
            />
            <small>TXT / MD / PDF / DOCX · 8 MB</small>
          </label>
        </div>
      </fieldset>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={Boolean(busy)}
        />
        我同意将本轮岗位、简历和面试回答发送至我配置的模型服务。
      </label>
      <p className="storage-note">
        本轮草稿和报告保留在当前浏览器标签页中。刷新可恢复，浏览器也可能恢复最近关闭的标签页；API
        Key 不在浏览器中保存。
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {session && (
        <div className="resume-session">
          <div>
            <b>{session.title}</b>
            <small>
              {session.questions.filter((q) => q.attempts.length).length} /{" "}
              {session.questions.length} 道题已有回答 · 本轮使用开始时的资料快照
            </small>
          </div>
          <button
            className="secondary"
            disabled={Boolean(busy)}
            onClick={resume}
          >
            继续这一轮 <ArrowRight size={16} />
          </button>
        </div>
      )}
      <section className="principles">
        <div>
          <b>01 · 评分有依据</b>
          <span>每一分都对应原文与量表</span>
        </div>
        <div>
          <b>02 · 追问有方向</b>
          <span>围绕缺失证据继续深入</span>
        </div>
        <div>
          <b>03 · 训练有闭环</b>
          <span>专项练习与两天后复测</span>
        </div>
      </section>
      {records.length > 0 && (
        <section className="recent">
          <div className="section-heading">
            <h3>最近的回答</h3>
            <span className="required">{records.length} 份报告</span>
          </div>
          {records.slice(0, 8).map((r) => (
            <button
              key={r.id}
              onClick={() => openReport(r.id)}
              disabled={Boolean(busy)}
            >
              <div>
                <b>{r.input.question}</b>
                <small>
                  {new Date(r.createdAt).toLocaleString("zh-CN")} · {r.model}
                </small>
              </div>
              <span>
                {r.score ?? "—"}
                <small> / 100</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
