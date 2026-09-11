import React, { useEffect, useState } from "react";
import { api } from "../api";
import { pollJob } from "../jobs";
export function ModelProfiles({ saved, onSave, close }) {
  const [profiles, setProfiles] = useState([]),
    [name, setName] = useState(""),
    [remember, setRemember] = useState(false),
    [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [paid, setPaid] = useState(false),
    [acceptance, setAcceptance] = useState(null),
    [jobId, setJobId] = useState(null);
  const reload = () => api("/profiles").then((r) => setProfiles(r.profiles));
  useEffect(() => {
    reload().catch((e) => setError(e.message));
    api("/jobs")
      .then((r) => {
        const j = r.jobs.find(
          (j) =>
            j.operation === "acceptance" &&
            j.config?.endpoint === saved?.endpoint &&
            j.config?.model === saved?.model &&
            j.config?.protocol === saved?.protocol,
        );
        if (j) {
          setJobId(j.id);
          setAcceptance(j.result || null);
          if (j.error) setError(j.error);
        }
      })
      .catch(() => {});
  }, []);
  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="utility-panel">
      <summary>多个模型档案与真实供应商验收</summary>
      <p>
        先保存上方模型，再将当前配置另存为档案。长期 Key 可选用 Windows
        凭据管理器保存，不写入 SQLite 或备份。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <label>
        档案名称
        <input
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="consent">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        将 Key 保存到本机 Windows 凭据管理器
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy || !saved || !name.trim()}
        onClick={() =>
          act(async () => {
            await api("/profiles", {
              method: "POST",
              body: { name, rememberKey: remember },
            });
            setName("");
            await reload();
          })
        }
      >
        另存当前配置
      </button>
      <label>
        切换无长期 Key 的档案时填写 Key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      {profiles.map((p) => (
        <article className="history-row" key={p.id}>
          <div>
            <b>
              {p.name} · {p.config.model}
            </b>
            <small>
              {p.config.protocol} · {p.config.baseUrl}
            </small>
            <small>
              最近连接测试：{p.testedAt || "未测试"} ·{" "}
              {p.hasStoredKey ? "系统凭据" : "未保存 Key"}
            </small>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await api(`/profiles/${p.id}/activate`, {
                    method: "POST",
                    body: { apiKey: key },
                  });
                  setKey("");
                  onSave(r.config);
                  close();
                })
              }
            >
              切换并重新确认发送
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api(`/profiles/${p.id}`, { method: "DELETE" });
                  await reload();
                })
              }
            >
              删除档案及凭据
            </button>
          </div>
        </article>
      ))}
      <h3>当前配置的真实调用验收</h3>
      <p>
        会向当前实际服务发送公开合成资料，验证连接、提取、出题、评分与复核、追问和长文本。不会使用本地模拟响应替代。通过结果只适用于被验证的具体配置。
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={paid}
          onChange={(e) => setPaid(e.target.checked)}
        />
        确认发送验收资料，并承担多次真实调用的费用
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy || !paid || !saved}
        onClick={() =>
          act(async () => {
            const id = crypto.randomUUID();
            setJobId(id);
            setAcceptance(null);
            await api("/jobs", {
              method: "POST",
              body: {
                id,
                operation: "acceptance",
                input: {},
                confirmPaidTest: true,
              },
            });
            setAcceptance(await pollJob(id));
          })
        }
      >
        运行完整供应商验收
      </button>
      {jobId && (
        <>
          <p>请求 ID：{jobId}</p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => act(async () => setAcceptance(await pollJob(jobId)))}
          >
            查询原验收结果
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              api(`/jobs/${jobId}/cancel`, { method: "POST", body: {} }).catch(
                (e) => setError(e.message),
              )
            }
          >
            取消验收（不保证撤销费用）
          </button>
        </>
      )}
      {acceptance ? (
        <p>
          已验证：{acceptance.checks.join("、")} · {acceptance.verifiedAt} ·{" "}
          {acceptance.scope}
        </p>
      ) : (
        <p>尚无此配置的完整验收通过记录。</p>
      )}
    </details>
  );
}
