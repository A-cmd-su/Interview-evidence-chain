import React from "react";
import { masteryStatus } from "../../shared/mastery.mjs";
export function MasteryBoard({ records, done, practice, openReport }) {
  const tasks = records
    .filter((r) => !r.originReportId)
    .flatMap((r) =>
      (r.trainingPlan?.tasks || []).map((t) => ({
        r,
        t,
        status: masteryStatus(r, records, t, done[r.id + ":" + t.id]),
      })),
    );
  const ordered = tasks.sort(
    (a, b) =>
      ({
        due: 0,
        failed: 1,
        unstarted: 2,
        practiced: 3,
        verified: 4,
        stable: 5,
      })[a.status.state] -
        {
          due: 0,
          failed: 1,
          unstarted: 2,
          practiced: 3,
          verified: 4,
          stable: 5,
        }[b.status.state] ||
      Date.parse(a.status.nextDue) - Date.parse(b.status.nextDue),
  );
  return (
    <details className="utility-panel">
      <summary>
        长期掌握度 ·{" "}
        {tasks.filter((t) => ["due", "failed"].includes(t.status.state)).length}{" "}
        项待复测
      </summary>
      <p>
        首次建议2天后复测，通过后7天再换场景，至少两次不同新场景与新回答通过才记为稳定，之后每30天复核。提前练习、同题重答和勾选完成不会累计稳定掌握次数；模型与资料改变时分段。
      </p>
      {ordered.slice(0, 30).map(({ r, t, status }) => (
        <article className="utility-panel" key={r.id + t.id}>
          <b>
            {t.title} · {status.label}
          </b>
          <p>
            有效验证 {status.passes} 次 · 下次{" "}
            {new Date(status.nextDue).toLocaleDateString("zh-CN")}
          </p>
          <p>{t.criterion}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => practice(t, r, true)}
          >
            换场景复测
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => openReport(r.id)}
          >
            查看起点证据
          </button>
          {status.rejected.length > 0 && (
            <details>
              <summary>未累计的练习及原因</summary>
              {status.rejected.map(({ report, reason }) => (
                <p key={report.id}>
                  {reason}
                  <button
                    className="text-button"
                    onClick={() => openReport(report.id)}
                  >
                    查看回答
                  </button>
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
      {tasks.length > 30 && (
        <p>优先展示最近需处理的30项，其余可在对应报告训练计划中查看。</p>
      )}
      {!tasks.length && <p>完成在线面试后，根据报告中的实际短板生成任务。</p>}
    </details>
  );
}
