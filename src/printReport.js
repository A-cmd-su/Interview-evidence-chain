const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const quote = (label, span) =>
  `<p>${escape(label)} · 字符 ${escape(span?.start)}–${escape(span?.end)} · 轮次 ${escape(span?.turn ?? "当前")}</p><blockquote>${escape(span?.quote || "缺少引用")}</blockquote>`;
export function reportHtml(r) {
  const language =
    r.input.briefing?.languageSettings || r.input.languageSettings || {};
  const capture = r.input.answerCapture;
  return `<article><h2>${escape(r.input.question)}</h2>
  <p>${escape(r.createdAt)} · ${escape(r.model)} · 难度 ${escape(r.input.difficulty)} · 总分 ${escape(r.score ?? "证据不足")}</p>
  <p>方式 ${escape(r.input.interviewMode || "text")} · 提问 ${escape(language.questionLanguage || r.input.language)} · 回答 ${escape(language.answerLanguage || r.input.language)} · 简历 ${escape(language.resumeLanguage || "auto")} · 语言目标 ${escape(language.targetLevel || "general")}</p>
  <p>量表 ${escape(r.schemaVersion)} · 提示词 ${escape(r.evaluation?.promptVersion)} · 复核 ${escape(r.semanticReview?.version || "未复核")} · ${escape(r.semanticReview?.model)} · ${escape(r.semanticReview?.endpoint)}</p>
  <h3>快速复盘</h3><p>缺口：${escape(r.missing.join("、") || "未检出新增缺口")}。五维复核支持 ${r.scores.filter((s) => s.status === "supported").length} 项；通过比例不等于统计置信度，不证明经历真实。</p>
  <h3>确认回答</h3><pre>${escape(r.input.answer)}</pre>
  ${(r.input.history || []).map((t, i) => `<p>此前轮次 ${i}：${escape(t.question)}</p><pre>${escape(t.answer)}</pre>`).join("")}
  ${capture ? `<h3>转写校对记录</h3><p>确认时间 ${escape(capture.confirmedAt)} · ${escape(capture.kind)}</p><h4>原始转写（未作为评分输入）</h4><pre>${escape(capture.rawTranscript)}</pre><h4>人工确认文字</h4><pre>${escape(capture.confirmedText)}</pre>` : ""}
  <p>音视频未保存至报告或服务器，离开录制页面后清理；如启用专用转写，仅在用户确认后向所选服务上传音轨。</p>
  ${r.scores.map((s) => `<section><h3>${escape(s.dimension)}：${escape(s.score ?? "证据不足")} / 5</h3><p>状态 ${escape(s.status)} · 复核 ${escape(s.review?.verdict || "未复核")}</p><p>${escape(s.note)}</p><p>复核理由：${escape(s.review?.reason || "无")}</p>${quote("回答证据", s.evidence?.answer)}${quote("JD依据 " + (s.evidence?.requirement?.id || ""), s.evidence?.requirement)}<p>量表 ${escape(s.rubric.id)}：${escape(s.rubric.text)}</p></section>`).join("")}
  <h3>待澄清事项</h3>${r.consistency.map((c) => `<p>${escape(c.reason)}</p>${quote("先前表述", c.claim)}${quote("当前回答", c.answer)}<p>${escape(c.question)}</p>`).join("") || "<p>未检出可定位线索。</p>"}
  ${r.languageAnalysis ? `<h3>语言表达分析</h3><p>${escape(r.languageAnalysis.summary)}</p>${r.languageAnalysis.observations.map((o) => `${quote(o.aspect, o)}<p>${escape(o.suggestion)}</p><p>表达示例：${escape(o.rewrite)}</p>`).join("")}` : ""}
  <h3>训练任务</h3>${r.trainingPlan.tasks.map((t) => `<section><h4>${escape(t.title)} · ${escape(t.gap)}</h4><p>${escape(t.prompt)}</p><p>完成标准：${escape(t.criterion)}</p><p>来源报告 ${escape(t.sourceReportId || r.id)} · 依据 ${escape(t.evidenceIds?.join("、"))}</p></section>`).join("")}
  <p>首次建议 ${escape(r.trainingPlan.dueAt)} 复测。通过后7天换场景，至少两次有效新场景通过才记为稳定，之后30天复核；勾选完成不代表掌握。</p>
  ${r.trainingVerification ? `<p>新回答核验：${r.trainingVerification.passed ? "通过" : "未通过"} · ${escape(r.trainingVerification.reason)}</p>${quote("核验依据", { ...r.trainingVerification, end: r.trainingVerification.start + r.trainingVerification.quote.length })}` : ""}
  <details open><summary>资料原文与位置</summary><h4>JD</h4><pre>${escape(r.input.jd)}</pre><h4>简历</h4><pre>${escape(r.input.resume)}</pre>${(r.input.resumeReview?.items || []).map((i) => `<p>${escape(i.kind)} · ${i.page ? `PDF第${escape(i.page)}页` : `段落 ${escape(i.paragraph)}`} · 字符 ${i.start}–${i.end}：${escape(i.quote)}</p>`).join("")}</details></article>`;
}
export function printReports(title, reports, session) {
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) throw new Error("请允许打印窗口后重试");
  popup.document.write(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:15px/1.7 system-ui;color:#17212b;max-width:900px;margin:30px auto;padding:20px}pre,blockquote{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#f4f6f7;padding:14px}section{break-inside:avoid;border-bottom:1px solid #ddd}article{break-before:page}article:first-of-type{break-before:auto}button{padding:12px}h1{font-size:26px}@media print{button{display:none}body{margin:0;max-width:none}details{display:block}@page{size:A4;margin:16mm}}</style><button id="print">打印 / 另存为 PDF</button><h1>${escape(title)}</h1><p>个人面试训练报告。岗位覆盖率不代表能力得分。</p>${session ? `<p>规划 ${session.questions.length} 道题，已报告 ${reports.length} 次回答；未提问不视为能力不足。</p>` : ""}${reports.map(reportHtml).join("")}</html>`,
  );
  popup.document.close();
  popup.document.getElementById("print").onclick = () => popup.print();
}
