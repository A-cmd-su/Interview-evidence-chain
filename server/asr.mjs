import { InputError } from "../shared/analyze.mjs";
import { digest } from "./store.mjs";
import { credential } from "./credentials.mjs";
import { validateConfig, ProviderError } from "./provider.mjs";
const MAX_AUDIO = 8 * 1024 * 1024;
const TYPES = new Map([
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/wav", "wav"],
  ["audio/mpeg", "mp3"],
]);
export async function transcribeAudio(
  buffer,
  input,
  config,
  { signal, fetchImpl = fetch, onUsage } = {},
) {
  const form = new FormData();
  form.set(
    "file",
    new Blob([buffer], { type: input.mime }),
    `answer.${TYPES.get(input.mime)}`,
  );
  form.set("model", config.model);
  form.set("response_format", "json");
  form.set("language", input.language.split("-")[0]);
  const timeout = AbortSignal.timeout(config.timeoutSeconds * 1000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      redirect: "error",
      headers: config.apiKey
        ? { Authorization: `Bearer ${config.apiKey}` }
        : {},
      body: form,
      signal: combined,
    });
  } catch {
    throw new ProviderError(
      combined.aborted
        ? "转写已取消或超时，录音仍保留在当前页面"
        : "转写服务无法连接，请检查地址、协议及网络",
      { code: combined.aborted ? "ASR_CANCELLED" : "ASR_NETWORK" },
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(
      `转写服务返回 HTTP ${response.status}，请检查 ASR 模型和 Key`,
      { code: "ASR_HTTP", upstreamStatus: response.status },
    );
  }
  let bytes = 0,
    chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 256000)
      throw new ProviderError("转写响应过大", { code: "ASR_FORMAT" });
    chunks.push(chunk);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ProviderError("转写服务未返回 JSON", { code: "ASR_FORMAT" });
  }
  const count = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null);
  const usage = {
    inputTokens: count(data.usage?.input_tokens),
    outputTokens: count(data.usage?.output_tokens),
    totalTokens: count(data.usage?.total_tokens),
    audioSeconds:
      typeof data.usage?.seconds === "number" && data.usage.seconds >= 0
        ? data.usage.seconds
        : null,
  };
  onUsage?.(usage);
  if (
    typeof data.text !== "string" ||
    !data.text.trim() ||
    data.text.length > 8000
  )
    throw new ProviderError("转写文字缺失或超出8000字符，请缩短录音", {
      code: "ASR_FORMAT",
    });
  return {
    text: data.text,
    usage,
    model: config.model,
    endpoint: config.endpoint,
    transcribedAt: new Date().toISOString(),
    needsConfirmation: true,
  };
}
export function asrRoutes({ store, jobs, readBody, send, options }) {
  const resolve = async (s, value) => {
    const p = store.profiles().find((p) => p.id === value?.profileId);
    if (!p) throw new InputError("请先保存并选择转写服务的模型档案");
    const key = p.hasStoredKey
      ? (await credential("get", p.id)).secret
      : s.profileKeys?.get(p.id);
    const c = validateConfig({
      ...p.config,
      baseUrl: value.endpoint,
      model: value.model,
      apiKey: key || "",
    });
    const endpoint = new URL(value.endpoint);
    if (!endpoint.pathname.endsWith("/audio/transcriptions"))
      throw new InputError(
        "ASR 目前支持兼容 multipart audio/transcriptions 的接口，请填写完整地址",
      );
    return { ...c, endpoint: endpoint.href };
  };
  return async (req, res, s, path) => {
    const reply = (v, status = 200) => {
      send(res, status, v);
      return true;
    };
    if (path === "/api/asr" && req.method === "GET") {
      const config = store.get("asr").value;
      return reply({ config, stamp: digest(config) });
    }
    if (path === "/api/asr" && req.method === "PUT") {
      if (jobs.busy) throw new InputError("请先等待或取消当前任务");
      const b = await readBody(req);
      if (b.disabled === true) {
        store.put("asr", null);
        return reply({ config: null, stamp: digest(null) });
      }
      const c = await resolve(s, b);
      const config = {
        profileId: b.profileId,
        endpoint: c.endpoint,
        model: c.model,
      };
      store.put("asr", config);
      return reply({ config, stamp: digest(config) });
    }
    if (path !== "/api/asr/jobs" || req.method !== "POST") return false;
    const b = await readBody(req),
      settings = store.get("asr").value;
    if (b.confirmAudioUpload !== true || b.configStamp !== digest(settings))
      throw new InputError("请重新确认音频上传的实际接收方");
    const config = await resolve(s, settings);
    if (
      !TYPES.has(b.mime) ||
      typeof b.audio !== "string" ||
      b.audio.length > Math.ceil((MAX_AUDIO * 4) / 3) + 4 ||
      !b.audio ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b.audio) ||
      !["zh-CN", "en-US", "ja-JP"].includes(b.language) ||
      !Number.isFinite(b.durationSeconds) ||
      b.durationSeconds <= 0 ||
      b.durationSeconds > 180
    )
      throw new InputError("音频格式、时长或大小无效（最多180秒、8MB）");
    const buffer = Buffer.from(b.audio, "base64");
    if (buffer.length > MAX_AUDIO || !buffer.length)
      throw new InputError("音频大小无效");
    const input = {
      audioHash: digest(b.audio),
      mime: b.mime,
      language: b.language,
      durationSeconds: b.durationSeconds,
    };
    return reply(
      jobs.start(b.id, "asr", input, config, async (signal, id) =>
        transcribeAudio(buffer, input, config, {
          ...options,
          signal,
          onUsage: (u) =>
            store.addUsage({
              ...u,
              requestId: id,
              operation: "asr",
              createdAt: new Date().toISOString(),
              model: config.model,
              endpoint: config.endpoint,
              sessionId: b.sessionId || null,
              estimatedCost: null,
              currency: null,
            }),
        }),
      ),
      202,
    );
  };
}
