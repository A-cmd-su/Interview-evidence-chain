import React from "react";
export function ReportRecap({ report, goPlan }) {
  const supported = report.scores.filter((s) => s.status === "supported"),
    disputed = report.scores.filter((s) =>
      ["semantic_unsupported", "semantic_uncertain"].includes(s.status),
    );
  const priority = report.trainingPlan.tasks[0];
  return (
    <section className="utility-panel" aria-label="快速复盘">
      <h3>本次最值得改进的地方</h3>
      <p>
        {report.missing.length
          ? `回答仍缺少：${report.missing.join("、")}`
          : "未发现新增信息缺口，请结合证据复核结果阅读。"}
      </p>
      {priority && (
        <>
          <b>{priority.title}</b>
          <p>{priority.criterion}</p>
          <button className="secondary" onClick={goPlan}>
            进入针对性训练
          </button>
        </>
      )}
      <p>
        五维中 {supported.length} 项有复核支持；{disputed.length}{" "}
        项初评与复核存在分歧或歧义。通过比例是证据状态，不是统计置信度，也不代表经历真实性。
      </p>
      {disputed.length > 0 && (
        <details>
          <summary>查看评分分歧</summary>
          {disputed.map((s) => (
            <div key={s.dimension}>
              <b>
                {s.dimension} ·{" "}
                {s.review?.verdict === "uncertain"
                  ? "存在歧义"
                  : "证据不支持初评"}
              </b>
              <blockquote>{s.evidence?.answer?.quote}</blockquote>
              <p>{s.review?.reason || s.note}</p>
            </div>
          ))}
        </details>
      )}
      <small>
        复核模型 {report.semanticReview?.model || "未调用"} ·{" "}
        {report.semanticReview?.endpoint || ""}
      </small>
      {report.languageAnalysis && (
        <details open>
          <summary>语言表达专项反馈</summary>
          <p>{report.languageAnalysis.summary}</p>
          {report.languageAnalysis.observations.map((o, i) => (
            <article key={i}>
              <b>
                {o.aspect} · 字符 {o.start}–{o.end}
              </b>
              <blockquote>{o.quote}</blockquote>
              <p>{o.suggestion}</p>
              <p>表达示例（需自行核实语义）：{o.rewrite}</p>
            </article>
          ))}
        </details>
      )}
      {report.budget && (
        <p>
          本次实际用量费用估算：
          {report.usage?.every((u) => u.estimatedCost != null)
            ? report.usage.reduce((s, u) => s + u.estimatedCost, 0).toFixed(4) +
              " " +
              report.budget.currency
            : "缺少费率或供应商用量，无法完整计算"}
          。详见历史与设置。
        </p>
      )}
    </section>
  );
}
