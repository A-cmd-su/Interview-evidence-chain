import React, { useEffect, useState } from "react";
import { api } from "../api";
const ROLES = {
  briefing: "岗位提取",
  resume: "简历提取",
  prepare: "问题生成",
  analyze: "回答评分与追问",
  review: "独立证据复核",
  equivalent: "等价场景",
  mastery: "掌握度核验",
  language: "语言表达分析",
};
export function ModelRouting({ current }) {
  const [data, setData] = useState(null),
    [routes, setRoutes] = useState({}),
    [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [keys, setKeys] = useState({});
  async function reload() {
    const r = await api("/routing");
    setData(r);
    setRoutes(r.routes);
    setConfirm(false);
  }
  useEffect(() => {
    reload().catch((e) => setMessage(e.message));
  }, []);
  async function act(fn) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="utility-panel"
      onToggle={(e) => {
        if (e.currentTarget.open) act(reload);
      }}
    >
      <summary>模型分工与接收方确认</summary>
      <p>
        默认模型：{current?.model || "未配置"} · {current?.endpoint}
        。复核可指定不同服务或模型；不会自动替换失败的服务。
      </p>
      {data && (
        <fieldset disabled={busy}>
          <div className="preparation-settings">
            {Object.entries(ROLES).map(([role, label]) => (
              <label key={role}>
                {label}
                <select
                  value={routes[role] || ""}
                  onChange={(e) => {
                    setRoutes({ ...routes, [role]: e.target.value });
                    setConfirm(false);
                  }}
                >
                  <option value="">当前默认模型</option>
                  {data.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.config.model}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <ul>
            {[...new Set(Object.values(routes).filter(Boolean))].map((id) => {
              const p = data.profiles.find((p) => p.id === id);
              return (
                <li key={id}>
                  {p ? (
                    <>
                      <b>{p.name}</b> · {p.config.model} · {p.config.protocol}
                      <small>{p.config.endpoint}</small>
                      {!p.unlocked && (
                        <label>
                          解锁 Key（仅当前会话）
                          <input
                            type="password"
                            autoComplete="off"
                            value={keys[id] || ""}
                            onChange={(e) =>
                              setKeys({ ...keys, [id]: e.target.value })
                            }
                          />
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              act(async () => {
                                await api(`/profiles/${id}/unlock`, {
                                  method: "POST",
                                  body: { apiKey: keys[id] || "" },
                                });
                                setKeys({ ...keys, [id]: "" });
                                const d = await api("/routing");
                                setData(d);
                              })
                            }
                          >
                            解锁
                          </button>
                        </label>
                      )}
                    </>
                  ) : (
                    "已删除的档案，请重新选择"
                  )}
                </li>
              );
            })}
          </ul>
          <label className="consent">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            确认所选服务接收对应任务所需的岗位、经历、确认回答及证据片段
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!confirm}
            onClick={() =>
              act(async () => {
                await api("/routing", {
                  method: "PUT",
                  body: { routes, confirmRecipients: true },
                });
                await reload();
                setMessage("模型分工已保存，接收方已确认");
              })
            }
          >
            保存并确认模型分工
          </button>
          <p>
            {data.confirmed
              ? "当前会话已确认此分工"
              : "分工变化或新会话需重新确认"}
          </p>
          <h3>供应商验收矩阵</h3>
          {data.acceptance.length ? (
            data.acceptance.map((a) => (
              <p key={a.fingerprint}>
                {a.config.model} · {a.config.endpoint} · {a.config.protocol}
                <br />
                {a.testedAt} ·{" "}
                {
                  {
                    passed: "完整流程通过",
                    failed: "最新验收失败",
                    cancelled: "验收已取消",
                    running: "验收未完成",
                  }[a.status]
                }{" "}
                · {(a.checks || []).join("、")}
              </p>
            ))
          ) : (
            <p>尚无实际账户验收记录；在下方启动当前配置验收。</p>
          )}
        </fieldset>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
