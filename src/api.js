export async function api(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(65000),
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError'
      ? '请求超时，请检查模型服务后重试。没有生成替代评分。'
      : '无法连接应用后端，请在项目目录运行 npm run dev，再刷新页面。');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('应用 API 返回了网页或非 JSON 响应。请使用 npm run dev 同时启动前后端，并确认 /api 代理生效。');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('应用 API 响应不是有效 JSON，请检查后端服务。'); }
  if (!response.ok) {
    const error = new Error(typeof data?.error === 'string' ? data.error : '服务请求失败');
    error.status = response.status;
    throw error;
  }
  return data;
}
export async function analyze(input) {
  return api('/analyze', { method: 'POST', body: { ...input, mode: 'online' } });
}
