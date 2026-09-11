const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function printReports(title, reports, session) {
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) throw new Error("请允许打印窗口后重试");
  const html = reports
    .map(
      (r) =>
        `<article><h2>${escape(r.input.question)}</h2><p>时间 ${escape(r.createdAt)} · 模型 ${escape(r.model)} · 难度 ${escape(r.input.difficulty)} · 总分 ${escape(r.score ?? "证据不足")}</p><p>量表 ${escape(r.schemaVersion)} · 提示词 ${escape(r.evaluation?.promptVersion)} · 复核 ${escape(r.semanticReview?.version || "未复核")}</p><h3>回答原文</h3><pre>${escape(r.input.answer)}</pre>${r.input.history?.length ? `<h3>此前回答</h3>${r.input.history.map((t, i) => `<p>轮次 ${i}：${escape(t.question)}</p><pre>${escape(t.answer)}</pre>`).join("")}` : ""}${r.scores.map((s) => `<section><h3>${escape(s.dimension)}：${escape(s.score ?? "证据不足")} / 5 · ${escape(s.review?.verdict || "未复核")}</h3><p>${escape(s.note)}</p><p>回答证据（轮次 ${escape(s.evidence?.answer?.turn ?? "当前")}）：${escape(s.evidence?.answer?.quote)}</p><p>JD依据 ${escape(s.evidence?.requirement?.id)}：${escape(s.evidence?.requirement?.quote)}</p><p>量表 ${escape(s.rubric?.id)}：${escape(s.rubric?.text)}</p></section>`).join("")}<h3>待澄清事项</h3>${r.consistency.map((c) => `<p>${escape(c.reason)}</p><blockquote>先前表述：${escape(c.claim.quote)}<br>当前回答：${escape(c.answer.quote)}</blockquote>`).join("") || "<p>未检出可定位的待澄清线索。</p>"}<h3>训练任务</h3>${r.trainingPlan.tasks.map((t) => `<p><b>${escape(t.title)} · ${escape(t.gap)}</b></p><p>${escape(t.prompt)}</p><p>完成标准：${escape(t.criterion)}</p>`).join("")}<p>建议复测 ${escape(r.trainingPlan.dueAt)}。勾选完成只表示做过；掌握需新回答证据验证。</p>${r.trainingVerification ? `<p>新回答验收：${r.trainingVerification.passed ? "通过" : "未通过"} · ${escape(r.trainingVerification.reason)} · 依据：${escape(r.trainingVerification.quote)}</p>` : ""}<details open><summary>资料原文</summary><h4>JD</h4><pre>${escape(r.input.jd)}</pre><h4>简历</h4><pre>${escape(r.input.resume)}</pre>${r.input.resumeReview?.items.map((i) => `<p>${escape(i.kind)} · ${i.page ? `PDF第${i.page}页` : `段落${i.paragraph}`} · 字符${i.start}–${i.end}：${escape(i.quote)}</p>`).join("") || ""}</details></article>`,
    )
    .join("");
  popup.document.write(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:15px/1.7 system-ui;color:#17212b;max-width:900px;margin:30px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#f4f6f7;padding:14px}section{break-inside:avoid;border-bottom:1px solid #ddd}article{break-before:page}article:first-of-type{break-before:auto}button{padding:12px}h1{font-size:26px}@media print{button{display:none}body{margin:0;max-width:none}details{display:block}@page{size:A4;margin:16mm}}</style><button id="print">打印 / 另存为 PDF</button><h1>${escape(title)}</h1><p>个人面试训练报告；非招聘或专业认证结论。岗位覆盖率不代表能力得分。</p>${session ? `<p>规划 ${session.questions.length} 道题；已报告 ${reports.length} 次回答。未提问不视为能力不足。</p>` : ""}${html}</html>`,
  );
  popup.document.close();
  popup.document.getElementById("print").onclick = () => popup.print();
}
