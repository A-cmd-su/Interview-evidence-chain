import React from "react";
import { printReports } from "../printReport";
import { BriefingSummary } from "./Preparation";
import { ArrowRight, Search, Download } from "lucide-react";
import { compareReports } from "../sessionSummary";
import { isReviewedScore } from "../../shared/analyze.mjs";
import { difficultyLabel } from "../../shared/difficulty.mjs";
const REVIEW_STATUS = {
  pending_review: "待语义复核，不发布分数",
  insufficient_evidence: "引用不完整，不发布分数",
  semantic_unsupported: "语义不支持，不发布分数",
  semantic_uncertain: "语义存疑，不发布分数",
};
export function Report({
  report,
  records,
  openReport,
  source,
  goPlan,
  practice,
  goSession,
}) {
  const turns = [
    ...(report.input.history || []),
    { question: report.input.question, answer: report.input.answer },
  ];
  const previous = records.find((r) => r.id === report.originReportId);
  const comparison = compareReports(report, previous);
  const legacy = !report.semanticReview;
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `面试证据-${report.createdAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page">
      <div className="report-header">
        <div>
          <span className="number-label">03 / EVERY SCORE TELLS A STORY</span>
          <h2>
            {report.score === null
              ? "先补齐证据，\n再看总分。"
              : `${report.score} 分，依据在这里。`}
          </h2>
          <p>{report.input.question}</p>
          <small>
            {new Date(report.createdAt).toLocaleString("zh-CN")} ·{" "}
            {report.model}
            {" · 难度：" + difficultyLabel(report.input.difficulty)}
          </small>
        </div>
        <div className="coverage">
          <strong>{report.coverage}%</strong>
          <span>{legacy ? "历史引用覆盖" : "语义复核通过维度"}</span>
        </div>
      </div>
      {report.difficultyPolicy && (
        <details className="difficulty-policy">
          <summary>
            {report.difficultyPolicy.label}难度 · 查看本次评价情境
          </summary>
          <p>{report.difficultyPolicy.guidance}</p>
          <p>按同一五维量表判断，不按难度加减分。不同难度不直接比较总分。</p>
          <small>{report.difficultyPolicy.version}</small>
        </details>
      )}
      <p className="report-note">
        {report.input.briefing && "本次评分依据已确认的岗位能力与面试设置。"}
        {legacy
          ? "历史初评：仅校验原文引用，未经语义复核。"
          : report.semanticReview.status === "not_required"
            ? "本轮没有引用完整的可评分维度，未发起语义复核。"
            : `已复核 ${report.semanticReview.reviewedCount} 个维度，通过 ${report.semanticReview.supportedCount} 个。初评与复核使用同一模型的两次独立请求，不代表人工核实或经历真实。`}
      </p>
      {comparison && (
        <div className="comparison">
          <b>
            {report.practiceKind === "targeted" ? "专项练习回看" : "复测对照"}
          </b>
          {comparison.comparable ? (
            <span>
              总分 {previous.score ?? "待补证"} → {report.score ?? "待补证"}
            </span>
          ) : (
            <span>{comparison.reason}</span>
          )}
          <span>
            原缺口本轮未再检出：{comparison.noLongerReported.join("、") || "无"}
          </span>
          <span>
            仍被检出的原缺口：{comparison.stillReported.join("、") || "无"}
          </span>
          <button
            className="text-button"
            onClick={() => openReport(previous.id)}
          >
            查看训练前证据
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <BriefingSummary
        briefing={report.input.briefing}
        practice={Boolean(report.practiceKind)}
      />
      <div className="report-layout">
        <section className="score-list">
          {report.scores.map((row) => (
            <details key={row.dimension} className="score-row" open>
              <summary>
                <span>
                  <b>{row.dimension}</b>
                  <small>
                    {isReviewedScore(row)
                      ? "原文校验通过 · 语义复核支持"
                      : row.status === "supported" && legacy
                        ? "历史初评 · 未经语义复核"
                        : REVIEW_STATUS[row.status] || "待复核，不发布分数"}
                  </small>
                </span>
                <strong>
                  {(isReviewedScore(row) || legacy ? row.score : null) ?? "—"}
                  <small> / 5</small>
                </strong>
              </summary>
              <div className="score-detail">
                <p>
                  {row.review ? "复核理由：" : ""}
                  {row.note}
                </p>
                {row.review && (
                  <small className="review-reference">
                    {row.review.evidenceId} · {report.semanticReview?.version}
                  </small>
                )}
                {row.evidence && (
                  <>
                    <div className="evidence-pair">
                      <span>回答原文</span>
                      <blockquote>{row.evidence.answer.quote}</blockquote>
                      <button
                        className="link-button"
                        aria-label={"定位" + row.dimension + "回答"}
                        onClick={() =>
                          source({
                            title:
                              row.dimension +
                              " · 第" +
                              (row.evidence.answer.turn + 1) +
                              "轮回答",
                            text: turns[row.evidence.answer.turn].answer,
                            span: row.evidence.answer,
                          })
                        }
                      >
                        <Search size={15} />
                        定位
                      </button>
                    </div>
                    <div className="evidence-pair">
                      <span>岗位要求</span>
                      <blockquote>{row.evidence.requirement.quote}</blockquote>
                      <button
                        className="link-button"
                        aria-label={"定位" + row.dimension + "岗位要求"}
                        onClick={() =>
                          source({
                            title: row.dimension + " · 岗位要求",
                            text: report.input.jd,
                            span: row.evidence.requirement,
                          })
                        }
                      >
                        <Search size={15} />
                        定位
                      </button>
                    </div>
                  </>
                )}
                <details className="rubric">
                  <summary>{row.rubric.title} · 查看量表</summary>
                  <p>{row.rubric.text}</p>
                  <small>{row.rubric.source}</small>
                  <code>{row.rubric.id}</code>
                </details>
              </div>
            </details>
          ))}
        </section>
        <aside className="report-aside">
          <div className="aside-card">
            <span className="eyebrow">WHAT NEEDS CLARIFYING</span>
            <h3>
              {report.consistency.length
                ? `${report.consistency.length} 项需要澄清`
                : "暂无可定位的矛盾线索"}
            </h3>
            {report.consistency.map((c, i) => (
              <article className="claim" key={i}>
                <small>{c.source === "resume" ? "简历主张" : "历史回答"}</small>
                <blockquote>{c.claim.quote}</blockquote>
                <button
                  className="link-button"
                  onClick={() =>
                    source({
                      title: "待澄清主张原文",
                      text:
                        c.source === "resume"
                          ? report.input.resume
                          : report.input.history[c.turn].answer,
                      span: c.claim,
                    })
                  }
                >
                  定位主张
                </button>
                <small>当前回答</small>
                <blockquote>{c.answer.quote}</blockquote>
                <button
                  className="link-button"
                  onClick={() =>
                    source({
                      title: "当前回答原文",
                      text: report.input.answer,
                      span: c.answer,
                    })
                  }
                >
                  定位回答
                </button>
                <p>{c.reason}</p>
                <b>{c.question}</b>
              </article>
            ))}
            <p className="soft-note">
              待澄清项用于追问；没有线索也不代表经历已经核实。
            </p>
          </div>
          <div className="aside-card">
            <span className="eyebrow">NEXT QUESTION</span>
            <h3>{report.followUp?.gap || "本题复盘"}</h3>
            {report.semanticReview && report.coverage < 100 && (
              <p className="soft-note">
                部分评分证据未获复核支持，需补充或澄清。
              </p>
            )}
            <p>{report.followUp?.question || report.followUpReason}</p>
            <button
              className="secondary"
              onClick={() => practice(null, report)}
            >
              重新回答这道题
            </button>
          </div>
          <div className="aside-card">
            <span className="eyebrow">REPORT SNAPSHOT</span>
            <p>
              原文、量表版本和模型名称随报告保存，方便你回看每次判断的依据。
            </p>
            <button className="secondary" onClick={download}>
              <Download size={16} />
              导出报告 JSON
            </button>
            <button
              className="secondary"
              onClick={() => printReports("面试证据报告", [report])}
            >
              打印 / PDF 报告
            </button>
          </div>
        </aside>
      </div>
      <div className="report-footer">
        <button className="secondary" onClick={goSession}>
          整场复盘
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button className="primary" onClick={goPlan}>
          开始专项训练 <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function Plan({
  report,
  records,
  done,
  toggle,
  practice,
  openReport,
  goSession,
}) {
  const plan = report.trainingPlan;
  const sourceReports = records.filter((r) => r.sessionId === report.sessionId);
  const latest = [
    ...new Map(sourceReports.map((r) => [r.questionId, r]).reverse()).values(),
  ];
  return (
    <div className="page">
      <span className="number-label">04 / CLOSE THE LOOP</span>
      <h2>{plan.title}</h2>
      <p className="difficulty-context">
        训练难度：{difficultyLabel(report.input.difficulty)}
        {!report.input.difficulty && " · 开始练习或复测时使用标准难度"}
      </p>
      <button className="text-button" onClick={goSession}>
        查看整场训练优先级
        <ArrowRight size={14} aria-hidden="true" />
      </button>
      <p className="lead">{plan.reason}</p>
      {latest.length > 1 && (
        <div className="report-selector">
          <label>
            本轮其他题的训练计划
            <select
              value={report.id}
              onChange={(e) => openReport(e.target.value, "plan")}
            >
              {latest.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.input.question.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="plan-meta">
        <strong>
          {plan.tasks.filter((t) => done[report.id + ":" + t.id]).length}/
          {plan.tasks.length}
        </strong>
        <span>已完成练习</span>
        <span>
          建议复测：{new Date(plan.dueAt).toLocaleDateString("zh-CN")}
        </span>
        <button className="secondary" onClick={() => practice(null, report)}>
          立即复测
        </button>
        <button
          className="secondary"
          onClick={() => practice(null, report, true)}
        >
          换场景验证
        </button>
      </div>
      <p className="storage-note">
        勾选完成只代表做过，不代表掌握。复测依据新回答检查完成标准。复测日期为训练建议，不会自动发送提醒。
      </p>
      {records
        .filter((r) => r.originReportId === report.id && r.trainingVerification)
        .map((r) => (
          <div className="utility-panel" key={r.id}>
            <b>
              新回答验证：
              {r.trainingVerification.passed &&
              r.scores.every((s) => s.status === "supported")
                ? "本次通过"
                : "尚未通过"}
            </b>
            <p>{r.trainingVerification.reason}</p>
            <blockquote>{r.trainingVerification.quote}</blockquote>
            <button className="text-button" onClick={() => openReport(r.id)}>
              查看新证据与量表复核
            </button>
          </div>
        ))}
      {plan.tasks.length ? (
        <div className="task-grid">
          {plan.tasks.map((t, i) => (
            <article className="task" key={t.id}>
              <span>
                {String(i + 1).padStart(2, "0")} · {t.gap}
              </span>
              <h3>{t.title}</h3>
              <p>{t.prompt}</p>
              <div className="criterion">
                <b>完成标准</b>
                <p>{t.criterion}</p>
              </div>
              <button
                className="text-button"
                onClick={() => openReport(report.id)}
              >
                查看缺口来源与关联证据
                {report.questionRequirement?.label
                  ? ` · ${report.questionRequirement.label}`
                  : ""}
              </button>
              <div className="task-controls">
                <button className="primary" onClick={() => practice(t, report)}>
                  练习这道题 <ArrowRight size={16} />
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(done[report.id + ":" + t.id])}
                    onChange={() => toggle(report.id + ":" + t.id)}
                  />
                  已完成
                </label>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-inline">
          初评未生成训练任务。
          {report.semanticReview && report.coverage < 100
            ? "部分评分证据未获复核支持。"
            : "本轮未检出新增信息缺口。"}
        </div>
      )}
      <button
        className="text-button"
        onClick={() => openReport(report.id, "evidence")}
      >
        回看这份计划对应的评分证据
      </button>
    </div>
  );
}
