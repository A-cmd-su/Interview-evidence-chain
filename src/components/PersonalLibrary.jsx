import React, { useState } from "react";
const LABELS = {
  job: "岗位模板",
  resume: "简历版本",
  claim: "项目主张",
  question: "收藏问题",
};
export function PersonalLibrary({
  workspace,
  setWorkspace,
  onSelect,
  practice,
}) {
  const [kind, setKind] = useState("job"),
    [label, setLabel] = useState(""),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [editing, setEditing] = useState(null),
    [rename, setRename] = useState("");
  const materials = workspace.materials || [],
    draft = workspace.draft;
  const claims = draft.resumeReview?.confirmed ? draft.resumeReview.items : [];
  const filtered = materials.filter((m) =>
    (m.label + (m.question || m.quote || m.source))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10)),
    index = Math.min(page, pageCount - 1);
  function save() {
    if (!label.trim()) {
      setMessage("请填写名称");
      return;
    }
    if (materials.length >= 300) {
      setMessage("资料库已达300项，请先清理不需要的版本");
      return;
    }
    const item = {
      id: crypto.randomUUID(),
      kind,
      label: label.trim(),
      createdAt: new Date().toISOString(),
    };
    if (kind === "job") {
      if (!draft.jd.trim()) {
        setMessage("先填写岗位JD");
        return;
      }
      item.source = draft.jd;
      const p = workspace.preparation;
      item.briefing = p?.source.jd === draft.jd ? p.edited : null;
    }
    if (kind === "resume") {
      if (!draft.resume.trim()) {
        setMessage("先填写或导入简历");
        return;
      }
      item.source = draft.resume;
      item.review = draft.resumeReview?.confirmed ? draft.resumeReview : null;
      item.document =
        draft.resumeDocument?.text === draft.resume
          ? draft.resumeDocument
          : null;
    }
    if (kind === "claim") {
      const c = claims[Number(selected)];
      if (selected === "" || !c) {
        setMessage("先校对简历，再选择有原文位置的主张");
        return;
      }
      Object.assign(item, {
        source: draft.resume,
        quote: c.quote,
        start: c.start,
        end: c.end,
        page: c.page || null,
        paragraph: c.paragraph || null,
      });
    }
    setWorkspace((w) => ({ ...w, materials: [item, ...(w.materials || [])] }));
    setLabel("");
    setMessage("已保存到资料库，随工作区备份；名称不会改变原文");
  }
  function use(item) {
    if (item.kind === "question") {
      const r = workspace.records.find((r) => r.id === item.reportId);
      if (r) practice(null, r);
      else setMessage("原始报告已删除，请移除此收藏");
      return;
    }
    if (item.kind === "claim") return;
    setWorkspace((w) => ({
      ...w,
      preparation: null,
      draft:
        item.kind === "job"
          ? { ...w.draft, jd: item.source }
          : {
              ...w.draft,
              resume: item.source,
              resumeReview: item.review || null,
              resumeDocument: item.document || null,
            },
    }));
    onSelect();
    setMessage("已填入草稿，请确认资料发送后继续");
  }
  return (
    <details className="utility-panel">
      <summary>
        个人资料库 · 岗位、简历、主张与收藏（{materials.length}）
      </summary>
      <div className="preparation-settings">
        <label>
          保存内容
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(LABELS)
              .filter(([k]) => k !== "question")
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label>
          版本 / 名称
          <input
            maxLength={100}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
      </div>
      {kind === "claim" && (
        <label>
          已校对的简历原文
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">选择原文主张</option>
            {claims.map((c, i) => (
              <option value={i} key={i}>
                {c.kind} · {c.quote.slice(0, 80)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="secondary" onClick={save}>
        保存当前资料
      </button>
      <p>
        原文单独保留，简历必须先校对才能复用提取结果。收藏问题在单题报告中添加；资料库遵循同一保存期限。
      </p>
      <label>
        查找资料
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {filtered.slice(index * 10, index * 10 + 10).map((item) => (
        <article className="utility-panel" key={item.id}>
          <b>
            {LABELS[item.kind]} · {item.label}
          </b>
          <small>{item.createdAt}</small>
          <details>
            <summary>查看保存的原文</summary>
            <pre>{item.quote || item.question || item.source}</pre>
            {item.kind === "claim" && (
              <small>
                字符 {item.start}–{item.end} ·{" "}
                {item.page
                  ? `PDF第${item.page}页`
                  : `段落 ${item.paragraph || "未记录"}`}
              </small>
            )}
          </details>
          <div className="button-row">
            {item.kind !== "claim" && (
              <button
                type="button"
                className="secondary"
                onClick={() => use(item)}
              >
                {item.kind === "question" ? "用此题练习" : "填入本次资料"}
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(item.id);
                setRename(item.label);
              }}
            >
              重命名
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setWorkspace((w) => ({
                  ...w,
                  materials: (w.materials || []).filter(
                    (m) => m.id !== item.id,
                  ),
                }))
              }
            >
              移除本条
            </button>
          </div>
          {editing === item.id && (
            <label>
              新名称
              <input
                value={rename}
                maxLength={100}
                onChange={(e) => setRename(e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                disabled={!rename.trim()}
                onClick={() => {
                  setWorkspace((w) => ({
                    ...w,
                    materials: (w.materials || []).map((m) =>
                      m.id === item.id ? { ...m, label: rename.trim() } : m,
                    ),
                  }));
                  setEditing(null);
                }}
              >
                保存名称
              </button>
            </label>
          )}
        </article>
      ))}
      <div className="button-row">
        <button
          type="button"
          className="text-button"
          disabled={!index}
          onClick={() => setPage(index - 1)}
        >
          上一页
        </button>
        <span>
          {index + 1} / {pageCount}
        </span>
        <button
          type="button"
          className="text-button"
          disabled={index + 1 >= pageCount}
          onClick={() => setPage(index + 1)}
        >
          下一页
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
