import React from "react";
import { Preparation } from "./Preparation";
import { ResumeReview } from "./ResumeReview";
import { ArrowRight, Upload, CheckCheck, ScanText, Route } from "lucide-react";
import {
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  difficultyLabel,
} from "../../shared/difficulty.mjs";

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
  preparation,
  changePreparation,
  confirmPreparation,
  backToDraft,
  source,
  extractResume,
  changeResumeReview,
  ocr,
  setOcr,
  redact,
}) {
  if (preparation)
    return (
      <Preparation
        {...{
          preparation,
          changePreparation,
          confirmPreparation,
          backToDraft,
          source,
          busy,
          error,
          consent,
          setConsent,
        }}
      />
    );
  return (
    <div className="page">
      {session && (
        <div className="resume-session">
          <div>
            <b>当前面试 · {session.title}</b>
            <small>
              {session.questions.filter((q) => q.ready && !q.skipped).length}{" "}
              道待回答 ·{" "}
              {
                records
                  .filter((r) => r.sessionId === session.id)
                  .flatMap((r) => r.consistency).length
              }{" "}
              条待澄清线索
            </small>
          </div>
          <button className="primary" disabled={Boolean(busy)} onClick={resume}>
            继续当前面试
          </button>
        </div>
      )}
      <section className="intro">
        <div>
          <span className="number-label">01 / A BETTER NEXT ANSWER</span>
          <h2>准备下一场面试</h2>
          <p>校对岗位和简历，再围绕证据缺口练习。</p>
          <button className="primary" onClick={start} disabled={Boolean(busy)}>
            {busy === "briefing"
              ? "正在提取岗位信息…"
              : "提取岗位信息，开始校对"}
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
              accept=".txt,.md,.pdf,.docx,.png,.jpg,.jpeg,.webp"
              onChange={importFile}
            />
            <small>TXT / MD / PDF / DOCX · 8 MB</small>
          </label>
        </div>
      </fieldset>
      <div className="utility-panel">
        <label className="consent">
          <input
            type="checkbox"
            checked={ocr}
            disabled={Boolean(busy)}
            onChange={(e) => setOcr(e.target.checked)}
          />
          扫描 PDF / 图片
          OCR（首次使用需联网下载识别语言包，文字识别在浏览器本地完成）
        </label>
        <p>
          OCR 不会自动补写经历，导入后必须校对。勾选后重新导入需要识别的文件。
        </p>
        <button className="secondary" disabled={Boolean(busy)} onClick={redact}>
          发送前脱敏：手机号、邮箱、身份证号
        </button>
        <p>
          姓名、公司、地址和自定义敏感信息请在上方手动替换。替换后的原文可先检查，再确认发送。
        </p>
      </div>
      {draft.resume.trim() && (
        <ResumeReview
          draft={draft}
          change={changeResumeReview}
          extract={extractResume}
          busy={Boolean(busy)}
          source={source}
        />
      )}
      <fieldset
        className="difficulty-picker"
        disabled={Boolean(busy)}
        aria-describedby="difficulty-help"
      >
        <legend>面试难度</legend>
        <p id="difficulty-help">
          选择本轮训练的挑战程度。开始后固定难度，修改选择仅用于下一场面试。
        </p>
        <div className="difficulty-options">
          {DIFFICULTIES.map((level) => (
            <label key={level.id} className="difficulty-option">
              <input
                type="radio"
                name="difficulty"
                value={level.id}
                checked={(draft.difficulty || DEFAULT_DIFFICULTY) === level.id}
                onChange={() => update("difficulty", level.id)}
              />
              <span>
                <b>{level.label}</b>
                <small>{level.description}</small>
              </span>
            </label>
          ))}
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
        草稿、面试和报告保存在本机 SQLite；可在“历史与设置”搜索、备份和删除。Key
        不写入浏览器存储。
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
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
                  {" · 难度：" + difficultyLabel(r.input.difficulty)}
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
