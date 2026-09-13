import React, { useEffect, useState } from "react";
import { api } from "../api";
import { downloadJson } from "./DataCenter";

export function BackupPanel({ persist }) {
  const [status, setStatus] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [full, setFull] = useState(null);
  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    act(async () => setStatus(await api("/backups")));
    api("/full-backups")
      .then(setFull)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="utility-panel">
      <h3>自动备份</h3>
      <details>
        <summary>加密完整备份 / 异地目录</summary>
        <p>
          {full?.enabled
            ? `目录 ${full.directory} · ${full.count} 份 · 最近成功 ${full.lastSuccessfulAt || "尚无"}`
            : "未配置自动完整备份，可按运维说明设置 FULL_BACKUP_DIR 和独立备份口令。"}
        </p>
        <p>
          完整备份包含 SQLite 全部资料、配置档案、费率、用量和访问密码哈希；API
          Key
          留在系统凭据中，换设备需重新解锁。目标可使用挂载的异地磁盘；与源设备在同一磁盘上的备份不能防护整盘故障。
        </p>
        {full?.error && <p role="alert">{full.error}</p>}
        <button
          className="secondary"
          disabled={busy || !full?.enabled}
          onClick={() =>
            act(async () => {
              await persist();
              setFull(await api("/full-backups", { method: "POST" }));
            })
          }
        >
          立即生成加密完整备份
        </button>
      </details>
      <p>
        服务运行时每日保存一份经过校验的工作区快照，最多保留{" "}
        {status?.keep || 30} 份。删除面试不会同时删除备份，可单独清理。
      </p>
      {status && (
        <p>
          {status.enabled
            ? `目录：${status.directory}`
            : "当前服务未配置自动备份目录"}
          <br />
          最近成功：
          {status.lastSuccessfulAt
            ? new Date(status.lastSuccessfulAt).toLocaleString("zh-CN")
            : "尚无备份"}
          <br />
          {status.scope}
        </p>
      )}
      {(error || status?.error) && (
        <p role="alert" className="error">
          {error || status.error}
        </p>
      )}
      <div className="button-row">
        <button
          className="secondary"
          disabled={busy || !status?.enabled}
          onClick={() =>
            act(async () => {
              await persist();
              setStatus(await api("/backups", { method: "POST", body: {} }));
            })
          }
        >
          立即备份
        </button>
        <button
          className="secondary"
          disabled={busy || !status?.files.length}
          onClick={() => setConfirmClear(!confirmClear)}
        >
          清理服务器备份
        </button>
      </div>
      {confirmClear && (
        <p>
          清理后无法从这些快照恢复。
          <button
            disabled={busy}
            className="secondary"
            onClick={() =>
              act(async () => {
                setStatus(await api("/backups", { method: "DELETE" }));
                setConfirmClear(false);
              })
            }
          >
            确认删除所有自动备份
          </button>
        </p>
      )}
      <ul>
        {status?.files.map((name) => (
          <li key={name}>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                act(async () =>
                  downloadJson(await api(`/backups/${name}`), name),
                )
              }
            >
              下载{" "}
              {new Date(Number(name.slice(10, 23))).toLocaleString("zh-CN")}
            </button>
          </li>
        ))}
      </ul>
      <p>
        恢复时在下方导入下载的
        JSON；导入会覆盖当前工作区，请先备份。外部复制件需要自行管理。
      </p>
    </section>
  );
}
