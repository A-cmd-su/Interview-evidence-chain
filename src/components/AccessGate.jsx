import React, { useEffect, useState } from "react";
import { api } from "../api";

export function AccessGate({ children }) {
  const [status, setStatus] = useState(null),
    [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const check = () =>
    api("/auth")
      .then((r) => {
        setStatus(r);
        if (r.authenticated) setMounted(true);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    check();
    const expired = () => setStatus({ required: true, authenticated: false });
    window.addEventListener("access-expired", expired);
    return () => window.removeEventListener("access-expired", expired);
  }, []);
  const locked = !status?.authenticated;
  return (
    <>
      {locked && (
        <div className="page access-page">
          <h1>我的面试工作区</h1>
          {!status ? (
            <p>
              正在连接服务…{" "}
              <button className="secondary" onClick={check}>
                重试连接
              </button>
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  await api("/auth/login", {
                    method: "POST",
                    body: { password },
                  });
                  setPassword("");
                  await check();
                  window.dispatchEvent(new Event("access-restored"));
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="access-password">个人访问密码</label>
              <input
                id="access-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                maxLength={256}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button className="primary" disabled={busy || !password}>
                {busy ? "正在登录…" : "进入工作区"}
              </button>
              <p>
                密码由部署时设置，和模型 API Key
                分开。会话过期后重新登录，当前页面草稿保留。
              </p>
            </form>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      {mounted && <div hidden={locked}>{children}</div>}
      {status?.required && !locked && (
        <button
          className="secondary access-logout"
          onClick={async () => {
            try {
              await api("/auth/logout", { method: "POST", body: {} });
              location.reload();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          退出登录
        </button>
      )}
      {!locked && error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
