import React, { useEffect, useState } from "react";
import { api } from "../api";
import { availableSessions, trendGroups } from "../sessionSummary";
import { initialWorkspace } from "../state";

export function downloadJson(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DataCenter({
  workspace,
  setWorkspace,
  replace,
  persist,
  openSession,
  openReport,
}) {
  const [search, setSearch] = useState(""),
    [preferences, setPreferences] = useState(null),
    [usage, setUsage] = useState([]),
    [jobs, setJobs] = useState([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [deleteAll, setDeleteAll] = useState(false),
    [deleting, setDeleting] = useState(null),
    [renaming, setRenaming] = useState(null),
    [name, setName] = useState("");
  useEffect(() => {
    Promise.all([api("/preferences"), api("/usage")])
      .then(([p, u]) => {
        setPreferences(p);
        setUsage(u.usage);
        setJobs(u.jobs);
      })
      .catch((e) => setError(e.message));
  }, []);
  const sessions = availableSessions(workspace).filter((s) =>
    [
      s.title,
      s.jd,
      ...workspace.records
        .filter((r) => r.sessionId === s.id)
        .map((r) => r.input.question),
    ]
      .join("\n")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function act(fn) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    const ids = new Set(
      workspace.records.filter((r) => r.sessionId === id).map((r) => r.id),
    );
    const value = {
      ...workspace,
      session: workspace.session?.id === id ? null : workspace.session,
      sessions: workspace.sessions.filter((s) => s.id !== id),
      records: workspace.records.filter((r) => !ids.has(r.id)),
      selected: ids.has(workspace.selected) ? null : workspace.selected,
      done: Object.fromEntries(
        Object.entries(workspace.done).filter(
          ([k]) => !ids.has(k.split(":")[0]),
        ),
      ),
    };
    await persist(value);
    setWorkspace(value);
    setDeleting(null);
  }
  const inputTokens = usage.reduce((sum, u) => sum + (u.inputTokens || 0), 0),
    outputTokens = usage.reduce((sum, u) => sum + (u.outputTokens || 0), 0);
  const groups = trendGroups(workspace.records);
  return (
    <div className="page data-center">
      <h2>历史、隐私与用量</h2>
      <p>
        记录保存在本机
        SQLite。此版本面向本机单用户，其他本机使用者也可能访问本地服务。
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <section className="utility-panel">
        <h3>历史面试</h3>
        <label htmlFor="history-search">搜索岗位、标题或问题</label>
        <input
          id="history-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {sessions.length ? (
          sessions.map((s) => (
            <article className="history-row" key={s.id}>
              <div>
                <b>{s.title}</b>
                <small>
                  {s.createdAt
                    ? new Date(s.createdAt).toLocaleString()
                    : "历史记录"}
                </small>
              </div>
              <div className="button-row">
                <button className="secondary" onClick={() => openSession(s.id)}>
                  查看报告
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setRenaming(s.id);
                    setName(s.title);
                  }}
                >
                  重命名
                </button>
                <button
                  className="text-button"
                  disabled={busy || Boolean(workspace.pending)}
                  onClick={() => setDeleting(s.id)}
                >
                  删除
                </button>
              </div>
              {renaming === s.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = name.trim();
                    if (!title) return;
                    setWorkspace((w) => ({
                      ...w,
                      session:
                        w.session?.id === s.id
                          ? { ...w.session, title }
                          : w.session,
                      sessions: w.sessions.map((x) =>
                        x.id === s.id ? { ...x, title } : x,
                      ),
                    }));
                    setRenaming(null);
                  }}
                >
                  <label>
                    新名称
                    <input
                      required
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <button className="secondary">保存名称</button>
                </form>
              )}
              {deleting === s.id && (
                <div role="alert">
                  <p>将删除这场面试及其报告、练习勾选。可先导出备份。</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => act(() => remove(s.id))}
                  >
                    确认删除这场面试
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setDeleting(null)}
                  >
                    保留
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <p>暂无匹配的面试记录。</p>
        )}
      </section>
      <section className="utility-panel">
        <h3>长期能力趋势</h3>
        <p>
          仅同一岗位、资料、难度、问题路径、模型和量表条件的记录放入同一组。不同场景只看新证据，不直接比较总分。
        </p>
        {groups.length ? (
          groups.map((g, i) => (
            <details key={g.key}>
              <summary>
                分段 {i + 1} · {g.records[0].model} ·{" "}
                {g.records[0].input.question.slice(0, 45)} · {g.records.length}{" "}
                次
              </summary>
              <p>
                量表 {g.records[0].schemaVersion} · 提示词{" "}
                {g.records[0].evaluation?.promptVersion || "未记录"}
              </p>
              <p>反复缺口：{g.recurring.join("、") || "尚无反复出现的缺口"}</p>
              <p>
                连续两次新证据支持的改善：
                {g.improved.join("、") || "暂无足够可比记录"}
              </p>
              {g.records.map((r) => (
                <div className="history-row" key={r.id}>
                  <button
                    className="text-button"
                    onClick={() => openReport(r.id)}
                  >
                    {new Date(r.createdAt).toLocaleString()} ·{" "}
                    {r.score ?? "证据不足"}
                  </button>
                  <span>缺口：{r.missing.join("、") || "未检出"}</span>
                </div>
              ))}
            </details>
          ))
        ) : (
          <p>完成面试和复测后显示可比记录。</p>
        )}
      </section>
      <section className="utility-panel">
        <h3>备份与数据删除</h3>
        <div className="button-row">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await persist();
                downloadJson(
                  await api("/backup"),
                  `evidence-backup-${Date.now()}.json`,
                );
              })
            }
          >
            导出带校验的备份
          </button>
          <label className="upload">
            导入已校验备份
            <input
              type="file"
              accept=".json"
              disabled={busy || Boolean(workspace.pending)}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                act(async () => {
                  if (f.size > 25 * 1024 * 1024)
                    throw new Error("备份不得超过25MB");
                  const body = JSON.parse(await f.text());
                  if (
                    !window.confirm(
                      "导入将替换当前历史。请确认已导出需要保留的数据。",
                    )
                  )
                    return;
                  await persist();
                  const r = await api("/backup", { method: "POST", body });
                  await replace(r.value);
                  setMessage("SHA-256和结构校验通过，已导入。");
                });
              }}
            />
          </label>
          <button
            className="text-button"
            disabled={busy || Boolean(workspace.pending)}
            onClick={() => setDeleteAll(true)}
          >
            清空全部资料
          </button>
        </div>
        {deleteAll && (
          <div role="alert">
            <p>
              删除全部简历草稿、面试、任务结果与用量记录；模型档案请到模型设置单独删除。已有外部备份不会被删除。
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await persist();
                  await api("/workspace", { method: "DELETE" });
                  await replace(initialWorkspace());
                  setDeleteAll(false);
                  setUsage([]);
                  setJobs([]);
                })
              }
            >
              确认清空全部资料
            </button>
            <button className="text-button" onClick={() => setDeleteAll(false)}>
              保留资料
            </button>
          </div>
        )}
      </section>
      {preferences && (
        <section className="utility-panel">
          <h3>保存期限与成本估算</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await persist();
                await api("/preferences", { method: "PUT", body: preferences });
                await replace();
                setMessage("设置已保存，过期记录已清理。");
              });
            }}
          >
            <div className="preparation-settings">
              <label>
                资料保存期限
                <select
                  value={preferences.retentionDays}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      retentionDays: Number(e.target.value),
                    }))
                  }
                >
                  {[7, 30, 90, 365, 0].map((n) => (
                    <option key={n} value={n}>
                      {n ? `${n}天` : "直到手动删除"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                输入单价 / 百万 Token
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="0.0001"
                  value={preferences.inputRate}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      inputRate: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                输出单价 / 百万 Token
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="0.0001"
                  value={preferences.outputRate}
                  onChange={(e) =>
                    setPreferences((p) => ({
                      ...p,
                      outputRate: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                币种
                <select
                  value={preferences.currency}
                  onChange={(e) =>
                    setPreferences((p) => ({ ...p, currency: e.target.value }))
                  }
                >
                  <option>CNY</option>
                  <option>USD</option>
                </select>
              </label>
            </div>
            <button className="secondary" disabled={busy}>
              保存设置并清理到期资料
            </button>
          </form>
          <p>
            按记录创建时间保留，到期检查在启动、每日运行和修改设置时执行。备份文件由你自行保管；SQLite删除不等同于磁盘安全擦除。
          </p>
          <p>
            当前列出最近 {usage.length} 次调用：输入 {inputTokens} / 输出{" "}
            {outputTokens} Token；
            {
              usage.filter(
                (u) => u.inputTokens === null || u.outputTokens === null,
              ).length
            }{" "}
            次供应商未完整返回用量。
          </p>
          <p>
            按当前统一费率估算已知用量：
            {(
              (inputTokens * preferences.inputRate +
                outputTokens * preferences.outputRate) /
              1000000
            ).toFixed(6)}{" "}
            {preferences.currency}
            。不同模型可导出用量按各自费率核算；缓存折扣、税费和未知用量未计入。
          </p>
          <button
            className="text-button"
            onClick={() => downloadJson(usage, "model-usage.json")}
          >
            导出实际用量
          </button>
          <details>
            <summary>查看实际用量明细</summary>
            {usage.slice(0, 100).map((u, i) => (
              <p key={i}>
                {u.requestId} · {u.operation} · {u.model} · 输入{" "}
                {u.inputTokens ?? "未知"} / 输出 {u.outputTokens ?? "未知"}
              </p>
            ))}
          </details>
        </section>
      )}
      <section className="utility-panel">
        <h3>请求诊断</h3>
        <p>
          只记录请求 ID、耗时、失败类型和用量；不会记录 Key
          或简历正文到诊断日志。任务结果属于受保存期限管理的个人资料。
        </p>
        {jobs.slice(0, 30).map((j) => (
          <p key={j.id}>
            {j.id} · {j.operation} · {j.status} · {j.latencyMs ?? "—"} ms ·{" "}
            {j.failureType || "—"}
          </p>
        ))}
      </section>
    </div>
  );
}
