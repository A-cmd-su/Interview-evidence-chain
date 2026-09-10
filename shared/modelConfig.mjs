export function resolveEndpoint(value, protocol = "auto") {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash)
    throw new Error("API 地址不能包含凭据、查询参数或片段");
  if (!["auto", "chat", "responses"].includes(protocol))
    throw new Error("接口协议不受支持");
  const path = url.pathname.replace(/\/+$/, "");
  const suffix = path.endsWith("/chat/completions")
    ? "/chat/completions"
    : path.endsWith("/responses")
      ? "/responses"
      : null;
  const detected = suffix === "/responses" ? "responses" : "chat";
  if (suffix && protocol !== "auto" && protocol !== detected)
    throw new Error("完整 API 地址与选择的接口协议不一致");
  const resolved = protocol === "auto" ? detected : protocol;
  url.pathname = suffix ? path.slice(0, -suffix.length) || "/" : path || "/v1";
  const baseUrl = url.href.replace(/\/$/, "");
  return {
    baseUrl,
    protocol: resolved,
    endpoint:
      baseUrl + (resolved === "responses" ? "/responses" : "/chat/completions"),
  };
}
