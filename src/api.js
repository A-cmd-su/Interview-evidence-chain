export async function api(
  path,
  { method = "GET", body, fetchImpl = fetch } = {},
) {
  let response;
  try {
    response = await fetchImpl("/api" + path, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(125000),
    });
  } catch (error) {
    throw new Error(
      error.name === "TimeoutError"
        ? "请求超时，请重试；本次没有生成报告"
        : "应用后端无法连接，请运行 npm run dev 后刷新",
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "API 返回非 JSON 响应，请确认前后端已同时启动及 /api 代理生效",
    );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("API 响应无法解析，请重试");
  }
  if (!response.ok) {
    const error = new Error(data.error || "服务请求失败");
    error.status = response.status;
    error.details = data.details;
    throw error;
  }
  return data;
}
