import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { pollJob } from "../jobs";
const savedId = () => {
  try {
    return sessionStorage.getItem("evidence-asr-request");
  } catch {
    return null;
  }
};
export function AsrUpload({
  blob,
  language,
  seconds,
  onResult,
  onBusy,
  disabled,
}) {
  const [service, setService] = useState(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [id, setId] = useState(savedId),
    [recovered, setRecovered] = useState(null);
  const alive = useRef(true),
    current = useRef(null);
  useEffect(() => {
    api("/asr")
      .then(setService)
      .catch((e) => setMessage(e.message));
    return () => {
      alive.current = false;
      if (current.current)
        api(`/jobs/${current.current}/cancel`, { method: "POST" }).catch(
          () => {},
        );
    };
  }, []);
  useEffect(() => {
    setConsent(false);
  }, [blob, service?.stamp]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  async function track(requestId, restore = false) {
    current.current = requestId;
    setBusy(true);
    try {
      const result = await pollJob(requestId, (j) => {
        if (alive.current) setMessage(`转写请求 ${j.id} · ${j.status}`);
      });
      if (alive.current) {
        if (restore) setRecovered(result);
        else onResult(result.text);
        setMessage("转写完成，请回听并校对后确认。音频未保存到服务器。");
      }
    } catch (e) {
      if (alive.current) setMessage(e.message);
    } finally {
      current.current = null;
      if (alive.current) setBusy(false);
    }
  }
  async function upload() {
    if (!blob || !consent || !service?.config) return;
    setBusy(true);
    setMessage("");
    const requestId = crypto.randomUUID();
    setId(requestId);
    try {
      if (blob.size > 8 * 1024 * 1024)
        throw new Error("录音超过8MB，请缩短后重试");
      const audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (!alive.current) return;
      current.current = requestId;
      try {
        sessionStorage.setItem("evidence-asr-request", requestId);
      } catch {}
      await api("/asr/jobs", {
        method: "POST",
        body: {
          id: requestId,
          audio,
          mime: blob.type.split(";")[0],
          language,
          durationSeconds: Math.max(1, seconds),
          confirmAudioUpload: true,
          configStamp: service.stamp,
        },
      });
      if (!alive.current) {
        await api(`/jobs/${requestId}/cancel`, { method: "POST" });
        return;
      }
      await track(requestId);
    } catch (e) {
      if (alive.current) {
        setMessage(e.message);
        setBusy(false);
      }
    } finally {
      current.current = null;
    }
  }
  return (
    <details className="utility-panel">
      <summary>使用专用服务转写录音</summary>
      <p>
        {service?.config
          ? `${service.config.model} · ${service.config.endpoint}`
          : "尚未配置，请在历史与设置中添加专用转写服务。"}
      </p>
      <p>
        仅上传音轨，不上传画面。最多180秒/8MB；转写费用按供应商计费，不包含在文字
        Token 预算内。
      </p>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy || disabled}
          onChange={(e) => setConsent(e.target.checked)}
        />
        确认上传本段音频至上述服务并承担转写费用
      </label>
      <div className="button-row">
        <button
          type="button"
          className="secondary"
          disabled={busy || disabled || !blob || !consent || !service?.config}
          onClick={upload}
        >
          上传音轨并转写
        </button>
        {busy && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              api(`/jobs/${current.current}/cancel`, { method: "POST" }).catch(
                (e) => setMessage(e.message),
              )
            }
          >
            取消转写
          </button>
        )}
        {id && !busy && (
          <button
            type="button"
            className="text-button"
            onClick={() => track(id, true)}
          >
            恢复上次转写请求
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {recovered && (
        <div>
          <pre>{recovered.text}</pre>
          <button
            type="button"
            className="secondary"
            disabled={busy || disabled}
            onClick={() => {
              onResult(recovered.text);
              setRecovered(null);
            }}
          >
            确认属于本题，填入校对区
          </button>
        </div>
      )}
    </details>
  );
}
