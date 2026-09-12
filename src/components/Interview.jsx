import React, { useEffect, useState } from "react";
import { VoiceInput } from "./VoiceInput";
import { VideoInput } from "./VideoInput";
import { followDecision } from "../../shared/flow.mjs";
import { BriefingSummary } from "./Preparation";
import { ArrowRight, CornerDownRight, Check } from "lucide-react";
import { difficultyLabel } from "../../shared/difficulty.mjs";
export function Interview({
  session,
  question,
  report,
  records,
  busy,
  error,
  changeAnswer,
  submit,
  choose,
  follow,
  finish,
  openReport,
  source,
  skip,
  confirmEquivalent,
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = session.deadline
    ? Math.max(0, Math.ceil((session.deadline - now) / 1000))
    : null;
  const decision = session.flowVersion
    ? followDecision({
        missing: report?.missing || [],
        question: report?.followUp?.question,
        history: question.attempts,
        remainingSeconds: remaining ?? Infinity,
        skipped: question.skipped,
      })
    : { continue: true };
  const ended = question.attempts.length > 0 && !question.ready;
  return (
    <div className="page">
      <div className="interview-head">
        <div>
          <span className="number-label">02 / THINK OUT LOUD</span>
          <h2>{session.title}</h2>
          {remaining !== null && (
            <p role="timer">
              剩余预算 {Math.floor(remaining / 60)}:
              {String(remaining % 60).padStart(2, "0")} · 超时仍可提交当前回答
            </p>
          )}
          {session.equivalence && (
            <div className="utility-panel">
              <p>等价场景说明：{session.equivalence.reason}</p>
              <p>原题：{session.equivalence.originalQuestion}</p>
              {!session.equivalence.confirmed ? (
                <button className="secondary" onClick={confirmEquivalent}>
                  确认考察目标一致，开始复测
                </button>
              ) : (
                <p>场景已确认；本次独立验证新证据，不与原题直接比较总分。</p>
              )}
            </div>
          )}
          <BriefingSummary
            briefing={session.briefing}
            practice={Boolean(session.originReportId)}
          />
          <p className="difficulty-context">
            本轮难度：{difficultyLabel(session.difficulty)} ·{" "}
            {session.difficulty
              ? "本轮固定，复测与专项练习继承此难度"
              : "历史面试后续回答按标准难度评估"}
          </p>
          <p>
            {session.originReportId
              ? session.practiceKind === "targeted"
                ? "专项练习"
                : session.practiceKind === "equivalent"
                  ? "不同场景复测"
                  : "同题复测"
              : "按自己的节奏回答。好的追问，从具体的经历开始。"}
          </p>
        </div>
        <div className="progress">
          <span>
            已回答 {session.questions.filter((q) => q.attempts.length).length} /{" "}
            {session.questions.length} 道主问题
          </span>
          <div>
            <i
              style={{
                width:
                  (session.questions.filter((q) => q.attempts.length).length /
                    session.questions.length) *
                    100 +
                  "%",
              }}
            />
          </div>
        </div>
      </div>
      <div className="capabilities">
        {session.capabilities.map((c) => (
          <button
            key={c.id}
            onClick={() =>
              source({
                title: c.label + " · 岗位依据",
                text: session.jd,
                span: c,
              })
            }
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="interview-grid">
        <aside className="question-list">
          <span className="eyebrow">YOUR INTERVIEW PATH</span>
          {session.questions.map((q, i) => (
            <button
              key={q.id}
              disabled={Boolean(busy)}
              className={question.id === q.id ? "selected" : ""}
              onClick={() => choose(i)}
            >
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span>
                {q.skill}
                <small>{q.question}</small>
              </span>
              {q.attempts.length > 0 && (
                <Check size={14} aria-label="已有回答" />
              )}
            </button>
          ))}
        </aside>
        <section>
          <div className="answer-card">
            <span className="eyebrow">
              {question.attempts.length && question.ready
                ? "追问 · " + question.attempts.length
                : "QUESTION · " + (session.current + 1)}
            </span>
            <h3>
              {question.ready
                ? question.prompt
                : report?.input.question || question.question}
            </h3>
            <p className="answer-instruction">{question.why}</p>
            {question.skipped && <p>已跳过本题；跳过不计为能力不足。</p>}
            {question.ready ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label className="sr-only" htmlFor="answer">
                  你的回答
                </label>
                <textarea
                  id="answer"
                  maxLength={8000}
                  value={question.draft}
                  disabled={Boolean(busy)}
                  onChange={(e) => changeAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder="具体说说：当时的背景、你做了什么、如何验证结果…"
                />
                <div className="answer-footer">
                  <span>
                    {question.draft.length} / 8000 · Ctrl/Cmd + Enter 提交
                  </span>
                  <button
                    className="primary"
                    disabled={Boolean(busy) || !question.draft.trim()}
                  >
                    {busy === "analyze" ? "评估与复核中…" : "提交回答"}
                    <ArrowRight size={16} />
                  </button>
                </div>
                {session.interviewMode === "video" ? (
                  <VideoInput
                    disabled={Boolean(busy)}
                    language={session.language}
                    onConfirm={changeAnswer}
                  />
                ) : session.interviewMode === "voice" ? (
                  <VoiceInput
                    disabled={Boolean(busy)}
                    language={session.language}
                    onConfirm={changeAnswer}
                  />
                ) : (
                  <>
                    <p className="storage-note">
                      文字面试：你可以直接输入回答，也可以使用下方语音辅助后校对转写。
                    </p>
                    <VoiceInput
                      disabled={Boolean(busy)}
                      language={session.language}
                      onConfirm={changeAnswer}
                    />
                  </>
                )}
              </form>
            ) : (
              <blockquote className="submitted-answer">
                {report?.input.answer}
              </blockquote>
            )}
            {error && (
              <div className="error" role="alert">
                {error} 本次未生成报告，你的回答已保留。
              </div>
            )}
            <div className="privacy">
              {session.interviewMode === "video"
                ? "视频只用于本页回看；评分只发送你确认后的文字。"
                : session.interviewMode === "voice"
                  ? "录音只用于本页回听；评分只发送你确认后的文字。"
                  : "每次提交通常包含初评与语义复核两次模型调用，均可能计费。"}{" "}
              每次提交通常包含初评与语义复核两次模型调用，均可能计费。
            </div>
          </div>
          {ended && report && (
            <div className="followup-card">
              <span className="eyebrow">
                {report.coverage}%{" "}
                {report.semanticReview
                  ? "维度获语义复核支持"
                  : "历史引用覆盖，未经语义复核"}
              </span>
              <h3>
                {report.followUp
                  ? report.followUp.question
                  : report.followUpReason}
              </h3>
              <p>
                {report.missing.length
                  ? "还需补充：" + report.missing.join("、")
                  : "初评未检出新增信息缺口。"}
              </p>
              <div className="button-row">
                {report.followUp && decision.continue && (
                  <button
                    className="primary"
                    disabled={Boolean(busy)}
                    onClick={follow}
                  >
                    <CornerDownRight size={16} />
                    回答追问
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => openReport(report.id)}
                >
                  查看本题证据
                </button>
              </div>
              {!decision.continue && <p>{decision.reason}</p>}
            </div>
          )}
          {question.attempts.length > 0 && (
            <details className="turn-history">
              <summary>本题已提交的 {question.attempts.length} 轮回答</summary>
              {question.attempts.map((a, i) => (
                <article key={a.reportId}>
                  <small>{i === 0 ? "主问题" : "追问 " + i}</small>
                  <b>{a.question}</b>
                  <p>{a.answer}</p>
                  <button
                    className="text-button"
                    onClick={() => openReport(a.reportId)}
                  >
                    查看该轮报告
                  </button>
                </article>
              ))}
            </details>
          )}
        </section>
      </div>
      <div className="interview-actions">
        <button
          className="text-button"
          disabled={Boolean(busy) || question.skipped}
          onClick={skip}
        >
          跳过本题并停止追问
        </button>
        <button
          className="text-button"
          disabled={Boolean(busy)}
          onClick={finish}
        >
          查看整场复盘
        </button>
        {session.current + 1 < session.questions.length && (
          <button
            className="secondary"
            disabled={Boolean(busy)}
            onClick={() => choose(session.current + 1)}
          >
            下一道主问题 <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
