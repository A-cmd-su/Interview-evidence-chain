import React, { useEffect, useRef, useState } from "react";
import { Cable, Save, ListRestart, ClipboardCheck } from "lucide-react";
import { api } from "../api";
import { resolveEndpoint } from "../../shared/modelConfig.mjs";
import { Modal } from "./Modal";
import { ModelProfiles } from "./ModelProfiles";

const PRESETS = [
  ["custom", "自定义 / 中转", "", ""],
  ["openai", "OpenAI 兼容接口", "https://api.openai.com/v1", ""],
  [
    "responses",
    "OpenAI Responses / 兼容中转",
    "https://api.openai.com/v1/responses",
    "",
  ],
  ["deepseek", "DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat"],
  [
    "qwen",
    "通义千问",
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "qwen-plus",
  ],
  ["kimi", "Kimi", "https://api.moonshot.cn/v1", ""],
  [
    "gemini",
    "Gemini 兼容接口",
    "https://generativelanguage.googleapis.com/v1beta/openai",
    "",
  ],
  ["ollama", "Ollama", "http://127.0.0.1:11434/v1", ""],
  ["lmstudio", "LM Studio", "http://127.0.0.1:1234/v1", ""],
];
const CHECK_STATUS = { passed: "已通过", failed: "未通过", pending: "未测试" };
export function ModelSettings({ saved, close, onSave, onClear }) {
  const formRef = useRef(null),
    addressRef = useRef(null),
    errorRef = useRef(null),
    lock = useRef(false);
  const [form, setForm] = useState({
    baseUrl: saved?.endpoint || saved?.baseUrl || "",
    model: saved?.model || "",
    protocol: saved?.protocol || "auto",
    apiKey: "",
    jsonMode: saved?.jsonMode || false,
    tokenField: saved?.tokenField || "auto",
    timeoutSeconds: saved?.timeoutSeconds || 60,
    maxOutputTokens: saved?.maxOutputTokens || 8192,
  });
  const [preset, setPreset] = useState("custom"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [details, setDetails] = useState(null),
    [success, setSuccess] = useState("");
  const [models, setModels] = useState([]),
    [paidTest, setPaidTest] = useState(false),
    [tested, setTested] = useState(saved?.testedAt ? "passed" : "pending"),
    [structured, setStructured] = useState(
      saved?.structureTestedAt ? "passed" : "pending",
    );
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSuccess("");
    setError("");
    setDetails(null);
    setTested("pending");
    setStructured("pending");
    setPaidTest(false);
    if (["baseUrl", "apiKey", "protocol"].includes(key)) setModels([]);
  }
  let address = null;
  try {
    address = resolveEndpoint(form.baseUrl, form.protocol);
  } catch {
    /* Incomplete URL while typing. */
  }
  const reusable = Boolean(
    saved?.hasKey && address?.baseUrl === saved.baseUrl && !form.apiKey.trim(),
  );
  async function act(action) {
    if (
      lock.current ||
      (action === "list"
        ? !addressRef.current.reportValidity()
        : action !== "clear" && !formRef.current.reportValidity()) ||
      (action === "structure" && !paidTest)
    )
      return;
    lock.current = true;
    setBusy(action);
    setError("");
    setDetails(null);
    setSuccess("");
    if (action === "test") setTested("pending");
    if (action === "structure") setStructured("pending");
    if (action === "list") setModels([]);
    try {
      if (action === "clear") {
        await api("/session", { method: "DELETE" });
        onClear();
        close();
        return;
      }
      const path = {
        test: "/models/test",
        list: "/models/list",
        structure: "/models/test-structure",
        save: "/models",
      }[action];
      const result = await api(path, {
        method: "POST",
        body: {
          ...form,
          reuseSavedKey: reusable,
          ...(action === "structure" ? { confirmPaidTest: paidTest } : {}),
        },
      });
      if (action === "test") {
        setTested("passed");
        setSuccess(
          `连接测试通过 · ${result.latencyMs} ms · ${result.protocol === "responses" ? "Responses" : "Chat Completions"}${result.tokenField ? " · " + result.tokenField : ""}${result.warning ? "。" + result.warning : ""}`,
        );
      } else if (action === "list") {
        setModels(result.models);
        setSuccess(
          result.models.length
            ? `已获取 ${result.models.length} 个模型`
            : "模型列表为空，仍可手动填写模型 ID",
        );
      } else if (action === "structure") {
        setStructured("passed");
        setSuccess(
          `结构化样例校验通过 · ${result.latencyMs} ms · ${result.checks.join("、")}`,
        );
      } else {
        onSave(result.config);
        close();
      }
    } catch (e) {
      if (action === "test") setTested("failed");
      if (action === "structure") setStructured("failed");
      setError(
        e.message + (action === "list" ? "。仍可手动填写模型 ID。" : ""),
      );
      setDetails(e.details || null);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <Modal title="连接你的模型" close={close} locked={Boolean(busy)}>
      <ModelProfiles saved={saved} onSave={onSave} close={close} />
      {error && (
        <div
          className="error connection-error"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          <strong>请求未完成</strong>
          <p>{error}</p>
          {details?.code && (
            <small>
              {details.code}
              {details.upstreamStatus
                ? ` / HTTP ${details.upstreamStatus}`
                : ""}
            </small>
          )}
          {details?.endpoint && <code>{details.endpoint}</code>}
        </div>
      )}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          act("save");
        }}
      >
        <fieldset disabled={Boolean(busy)}>
          <label>
            服务预设
            <select
              value={preset}
              onChange={(e) => {
                const p = PRESETS.find((p) => p[0] === e.target.value);
                setPreset(p[0]);
                setForm((f) => ({
                  ...f,
                  baseUrl: p[2],
                  model: p[3],
                  apiKey: "",
                  protocol: "auto",
                  tokenField: "auto",
                  jsonMode: false,
                }));
                setSuccess("");
                setError("");
                setDetails(null);
                setModels([]);
                setTested("pending");
                setStructured("pending");
                setPaidTest(false);
              }}
            >
              {PRESETS.map((p) => (
                <option value={p[0]} key={p[0]}>
                  {p[1]}
                </option>
              ))}
            </select>
          </label>
          <label>
            API 地址
            <input
              ref={addressRef}
              required
              type="url"
              maxLength={500}
              value={form.baseUrl}
              onChange={(e) => change("baseUrl", e.target.value)}
              placeholder="https://your-provider.example/v1"
            />
          </label>
          <label>
            接口协议
            <select
              value={form.protocol}
              onChange={(e) => change("protocol", e.target.value)}
            >
              <option value="auto">自动识别</option>
              <option value="chat">Chat Completions</option>
              <option value="responses">Responses</option>
            </select>
          </label>
          {address && (
            <div className="endpoint-preview">
              <small>请求地址</small>
              <code>{address.endpoint}</code>
            </div>
          )}
          <div className="model-discovery">
            <button
              type="button"
              className="secondary"
              onClick={() => act("list")}
            >
              <ListRestart size={16} aria-hidden="true" />
              {busy === "list" ? "获取中…" : "获取模型列表"}
            </button>
          </div>
          {models.length > 0 && (
            <label>
              可选模型
              <select
                value={models.includes(form.model) ? form.model : ""}
                onChange={(e) => change("model", e.target.value)}
              >
                <option value="">手动填写 / 选择模型</option>
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            模型 ID
            <input
              required
              maxLength={200}
              value={form.model}
              onChange={(e) => change("model", e.target.value)}
              placeholder="供应商提供的完整模型名称"
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              autoComplete="off"
              maxLength={4096}
              value={form.apiKey}
              onChange={(e) => change("apiKey", e.target.value)}
              placeholder={reusable ? "已保存，留空不变" : "API Key"}
            />
          </label>
          <details className="advanced">
            <summary>兼容性设置</summary>
            <label>
              Token 参数
              <select
                disabled={address?.protocol === "responses"}
                value={form.tokenField}
                onChange={(e) => change("tokenField", e.target.value)}
              >
                <option value="auto">自动兼容</option>
                <option value="max_tokens">max_tokens（常规兼容服务）</option>
                <option value="max_completion_tokens">
                  max_completion_tokens（部分推理模型）
                </option>
              </select>
            </label>
            <label>
              输出 Token 上限
              <input
                type="number"
                min="512"
                max="32768"
                required
                value={form.maxOutputTokens}
                onChange={(e) =>
                  change("maxOutputTokens", Number(e.target.value))
                }
              />
            </label>
            <label>
              请求总超时（秒，含复核）
              <input
                type="number"
                min="15"
                max="120"
                required
                value={form.timeoutSeconds}
                onChange={(e) =>
                  change("timeoutSeconds", Number(e.target.value))
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.jsonMode}
                onChange={(e) => change("jsonMode", e.target.checked)}
              />
              JSON object 格式
            </label>
          </details>
          <details className="advanced">
            <summary>结构化能力测试</summary>
            <label className="check">
              <input
                type="checkbox"
                checked={paidTest}
                onChange={(e) => setPaidTest(e.target.checked)}
              />
              我同意发送合成样例进行初评与语义复核，通常调用模型两次，可能产生费用。
            </label>
            <button
              type="button"
              className="secondary structure-test"
              disabled={!paidTest}
              onClick={() => act("structure")}
            >
              <ClipboardCheck size={16} aria-hidden="true" />
              {busy === "structure" ? "校验中…" : "测试结构化能力"}
            </button>
          </details>
          <dl className="model-checks">
            <div>
              <dt>基础连通</dt>
              <dd>{CHECK_STATUS[tested]}</dd>
            </div>
            <div>
              <dt>结构化样例</dt>
              <dd>{CHECK_STATUS[structured]}</dd>
            </div>
          </dl>
          <div className="modal-foot">
            <button
              type="button"
              className="secondary"
              onClick={() => act("test")}
            >
              <Cable size={16} aria-hidden="true" />
              {busy === "test" ? "连接测试中…" : "测试连接"}
            </button>
            <button type="submit" className="primary">
              <Save size={16} aria-hidden="true" />
              {busy === "save" ? "保存中…" : "保存并使用"}
            </button>
          </div>
        </fieldset>
      </form>
      {success && (
        <div className="success" role="status">
          {success}
        </div>
      )}
      <p className="security">
        连接测试会发送一条短请求，可能计费。保存不会自动测试。Key
        默认仅在本机后端会话内存保留；可在模型档案中主动选择 Windows
        凭据管理器长期保存。
      </p>
      {saved && (
        <button
          className="text-button danger"
          disabled={Boolean(busy)}
          onClick={() => act("clear")}
        >
          清除本会话模型配置
        </button>
      )}
    </Modal>
  );
}
