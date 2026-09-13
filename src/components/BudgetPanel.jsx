import React, { useEffect, useState } from "react";
import { api } from "../api";
export function BudgetPanel() {
  const [budget, setBudget] = useState(null),
    [configs, setConfigs] = useState([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("/budget"), api("/profiles"), api("/health")])
      .then(([b, p, h]) => {
        setBudget(b);
        const all = [
          ...(h.config ? [{ name: "当前模型", config: h.config }] : []),
          ...p.profiles,
        ];
        setConfigs(
          all.filter(
            (p, i) =>
              all.findIndex(
                (x) =>
                  x.config.endpoint === p.config.endpoint &&
                  x.config.model === p.config.model,
              ) === i,
          ),
        );
      })
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <details className="utility-panel">
      <summary>单次面试预算与模型费率</summary>
      {budget && (
        <fieldset disabled={busy}>
          <p>
            费率单位：每百万 Token。此处币种统一计算，不自动换汇。0
            表示不设预算提醒；预估超额或费用未知时会在发送前停下，需明确继续。预检不能约束供应商最终账单。
          </p>
          <div className="preparation-settings">
            <label>
              单次面试预算
              <input
                type="number"
                min="0"
                max="100000"
                step="0.01"
                value={budget.limit}
                onChange={(e) =>
                  setBudget({ ...budget, limit: Number(e.target.value) })
                }
              />
            </label>
            <label>
              预算币种
              <select
                value={budget.currency}
                onChange={(e) =>
                  setBudget({ ...budget, currency: e.target.value })
                }
              >
                <option>CNY</option>
                <option>USD</option>
              </select>
            </label>
          </div>
          <label>
            添加模型费率
            <select
              value=""
              onChange={(e) => {
                const c = configs[Number(e.target.value)]?.config;
                if (
                  c &&
                  !budget.rates.some(
                    (r) => r.model === c.model && r.endpoint === c.endpoint,
                  )
                )
                  setBudget({
                    ...budget,
                    rates: [
                      ...budget.rates,
                      {
                        endpoint: c.endpoint,
                        model: c.model,
                        inputRate: 0,
                        outputRate: 0,
                      },
                    ],
                  });
              }}
            >
              <option value="">选择已保存模型</option>
              {configs.map((p, i) => (
                <option key={i} value={i}>
                  {p.name} · {p.config.model}
                </option>
              ))}
            </select>
          </label>
          {budget.rates.map((r, i) => (
            <div className="utility-panel" key={r.endpoint + r.model}>
              <b>{r.model}</b>
              <small>{r.endpoint}</small>
              <div className="preparation-settings">
                {["inputRate", "outputRate"].map((k) => (
                  <label key={k}>
                    {k === "inputRate" ? "输入单价" : "输出单价"}
                    <input
                      type="number"
                      min="0"
                      max="100000"
                      step="0.001"
                      value={r[k]}
                      onChange={(e) =>
                        setBudget({
                          ...budget,
                          rates: budget.rates.map((x, j) =>
                            i === j ? { ...x, [k]: Number(e.target.value) } : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setBudget({
                    ...budget,
                    rates: budget.rates.filter((_, j) => i !== j),
                  })
                }
              >
                删除费率
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              setBusy(true);
              try {
                setBudget(
                  await api("/budget", { method: "PUT", body: budget }),
                );
                setMessage("预算已保存，历史费用继续使用当时的费率");
              } catch (e) {
                setMessage(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            保存预算
          </button>
        </fieldset>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
