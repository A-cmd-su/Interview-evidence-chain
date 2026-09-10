import React from "react";
import { ArrowRight, Download, Search, ClipboardList } from "lucide-react";
import { summarizeSession, exportSessionSummary } from "../sessionSummary";

const STATUS = {
  assessed: "有语义复核支持",
  unreviewed: "历史证据待复核",
  insufficient: "待补证据",
  unassessed: "未评估",
};
export function SessionReport({
  session,
  records,
  openReport,
  source,
  practice,
  done,
  toggle,
}) {
  const summary = summarizeSession(session, records);
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify(exportSessionSummary(session, summary, done), null, 2)],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-session-${session.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="session-report">
      <header className="session-report-heading">
        <div>
          <span className="eyebrow">SESSION REVIEW</span>
          <h2>{session.title}</h2>
        </div>
        <button className="secondary" onClick={download}>
          <Download size={16} aria-hidden="true" />
          导出整场报告
        </button>
      </header>
      {!session.pathComplete && (
        <p className="report-note">
          历史记录缺少完整面试路径，以下仅包含已有报告的题目。
        </p>
      )}
      <dl className="session-metrics">
        <div>
          <dt>已评估主问题</dt>
          <dd>
            {summary.evaluated}
            <small> / {summary.total}</small>
          </dd>
        </div>
        <div>
          <dt>当前缺口类型</dt>
          <dd>{summary.gaps.length}</dd>
        </div>
        <div>
          <dt>待澄清线索</dt>
          <dd>{summary.clarifications.length}</dd>
        </div>
      </dl>
      <section className="summary-section">
        <h3>岗位能力与证据</h3>
        {summary.capabilities.length ? (
          <ul className="capability-summary">
            {summary.capabilities.map((capability) => (
              <li key={capability.id}>
                <div>
                  <b>{capability.label}</b>
                  <span className={`assessment-status ${capability.status}`}>
                    {STATUS[capability.status]}
                  </span>
                </div>
                <blockquote>{capability.quote}</blockquote>
                <div className="summary-links">
                  <button
                    className="text-button"
                    onClick={() =>
                      source({
                        title: capability.label + " · 岗位原文",
                        text: session.jd,
                        span: capability,
                      })
                    }
                  >
                    <Search size={14} aria-hidden="true" />
                    岗位原文
                  </button>
                  {capability.reports.map((report, i) => (
                    <button
                      className="text-button"
                      key={report.id}
                      onClick={() => openReport(report.id)}
                    >
                      相关证据 {i + 1}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>本轮没有岗位能力标签记录。</p>
        )}
      </section>
      <section className="summary-section">
        <h3>各题最新结果</h3>
        <ol className="question-summary">
          {summary.questions.map((question, i) => (
            <li key={question.id}>
              <span className="question-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <b>{question.question}</b>
                {question.report && (
                  <p>
                    {question.report.missing.length
                      ? "待补充：" + question.report.missing.join("、")
                      : "初评未检出新增缺口"}
                  </p>
                )}
              </div>
              {question.report ? (
                <button
                  className="secondary"
                  onClick={() => openReport(question.report.id)}
                >
                  <ClipboardList size={16} aria-hidden="true" />
                  {!question.report.semanticReview ? "历史初评 · " : ""}
                  {question.report.score === null
                    ? "待补证"
                    : question.report.score + " 分"}
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              ) : (
                <span className="assessment-status unassessed">未评估</span>
              )}
            </li>
          ))}
        </ol>
      </section>
      <section className="summary-section">
        <h3>优先训练</h3>
        {summary.priorities.length ? (
          <ol className="priority-summary">
            {summary.priorities.map((priority) => (
              <li key={priority.gap}>
                <div>
                  <b>{priority.gap}</b>
                  <small>{priority.reports.length} 道主问题仍有此缺口</small>
                </div>
                <div className="summary-links">
                  {priority.reports.map((report, i) => (
                    <button
                      className="text-button"
                      key={report.id}
                      onClick={() => openReport(report.id)}
                    >
                      依据 {i + 1}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                {priority.task && (
                  <button
                    className="secondary"
                    onClick={() =>
                      practice(priority.task.task, priority.task.report)
                    }
                  >
                    开始专项练习
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>
            {summary.evaluated
              ? "已完成的初评未检出新增信息缺口。"
              : "尚无已完成的模型分析。"}
          </p>
        )}
      </section>
      {summary.clarifications.length > 0 && (
        <section className="summary-section">
          <h3>待澄清线索</h3>
          <ul className="clarification-summary">
            {summary.clarifications.map(({ item, report }, i) => (
              <li key={report.id + ":" + i}>
                <blockquote>{item.claim.quote}</blockquote>
                <p>{item.reason}</p>
                <button
                  className="text-button"
                  onClick={() => openReport(report.id)}
                >
                  查看两方原文
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {summary.tasks.length > 0 && (
        <section className="summary-section">
          <h3>本轮训练任务</h3>
          <ul className="session-tasks">
            {summary.tasks.map(({ task, report }) => (
              <li key={report.id + ":" + task.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(done[report.id + ":" + task.id])}
                    onChange={() => toggle(report.id + ":" + task.id)}
                  />
                  <span>
                    {task.title}
                    <small>{task.gap}</small>
                  </span>
                </label>
                <div className="summary-links">
                  <button
                    className="text-button"
                    onClick={() => openReport(report.id, "plan")}
                  >
                    训练依据
                  </button>
                  <button
                    className="secondary"
                    onClick={() => practice(task, report)}
                  >
                    练习
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
