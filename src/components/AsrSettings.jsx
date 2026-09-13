import React, { useEffect, useState } from "react";
import { api } from "../api";
export function AsrSettings() {
  const [value, setValue] = useState({
      profileId: "",
      endpoint: "",
      model: "",
    }),
    [profiles, setProfiles] = useState([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("/asr"), api("/profiles")])
      .then(([a, p]) => {
        if (a.config) setValue(a.config);
        setProfiles(p.profiles);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const save = async (body) => {
    setBusy(true);
    try {
      await api("/asr", { method: "PUT", body });
      setMessage(
        body.disabled
          ? "专用转写已关闭"
          : "配置已保存，每次上传音频仍需单独确认",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="utility-panel">
      <summary>可选：专用语音转写服务</summary>
      <fieldset disabled={busy}>
        <p>
          支持 multipart /audio/transcriptions
          兼容接口及中转。先在模型设置中保存服务档案并解锁
          Key；文字模型和语音转写模型可不同。音频按供应商规则单独计费，暂不纳入
          Token 预算。
        </p>
        <label>
          凭据档案
          <select
            value={value.profileId}
            onChange={(e) => {
              const p = profiles.find((p) => p.id === e.target.value);
              setValue({
                ...value,
                profileId: e.target.value,
                endpoint: p
                  ? p.config.baseUrl + "/audio/transcriptions"
                  : value.endpoint,
              });
            }}
          >
            <option value="">选择模型档案</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.config.baseUrl}
              </option>
            ))}
          </select>
        </label>
        <label>
          完整转写接口地址
          <input
            type="url"
            value={value.endpoint}
            onChange={(e) => setValue({ ...value, endpoint: e.target.value })}
          />
        </label>
        <label>
          转写模型 ID
          <input
            value={value.model}
            maxLength={200}
            onChange={(e) => setValue({ ...value, model: e.target.value })}
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="secondary"
            onClick={() => save(value)}
          >
            保存转写配置
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => save({ disabled: true })}
          >
            关闭专用转写
          </button>
        </div>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
