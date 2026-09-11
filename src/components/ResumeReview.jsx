import React from "react";
import { reviewFromSegments } from "../../shared/resume.mjs";

export function ResumeReview({ draft, change, extract, busy, source }) {
  const review =
    draft.resumeReview?.sourceText === draft.resume
      ? draft.resumeReview
      : reviewFromSegments(
          draft.resume,
          draft.resumeDocument?.text === draft.resume
            ? draft.resumeDocument.segments
            : undefined,
        );
  const update = (items) => change({ ...review, items, confirmed: false });
  return (
    <section className="utility-panel resume-review">
      <h3>简历结构化校对</h3>
      <p>
        确认项目、职责、成果和时间线。条目必须保留连续原文；修改经历请先修正上方简历，再重新校对。未选中的条目不会进入出题或初评请求。
      </p>
      <div className="button-row">
        <button
          type="button"
          className="secondary"
          disabled={busy || !draft.resume.trim()}
          onClick={extract}
        >
          用模型提取结构
        </button>
        <span>
          {review.confirmed ? "已确认" : "待校对"} · {review.items.length} 条
        </span>
      </div>
      <details open={!review.confirmed && review.items.length < 8}>
        <summary>校对简历条目与原文位置</summary>
        {review.items.map((item, i) => (
          <article key={item.id} className="resume-item">
            <label>
              条目 {i + 1} 分类
              <select
                value={item.kind}
                disabled={busy}
                onChange={(e) =>
                  update(
                    review.items.map((x, j) =>
                      j === i ? { ...x, kind: e.target.value } : x,
                    ),
                  )
                }
              >
                {["项目", "职责", "成果", "时间线", "其他"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <blockquote>{item.quote}</blockquote>
            <div className="button-row">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  source({
                    title: `简历 · ${item.page ? `第${item.page}页` : `段落${item.paragraph || i + 1}`}`,
                    text: draft.resume,
                    span: item,
                  })
                }
              >
                查看来源 · 字符 {item.start}–{item.end}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => update(review.items.filter((_, j) => j !== i))}
              >
                移除此条目
              </button>
            </div>
          </article>
        ))}
      </details>
      <label className="consent">
        <input
          type="checkbox"
          disabled={busy || !review.items.length || review.items.length > 60}
          checked={review.confirmed}
          onChange={(e) => change({ ...review, confirmed: e.target.checked })}
        />
        我已校对这些原文条目的分类与来源，确认用于本轮面试
      </label>
    </section>
  );
}
