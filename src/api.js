import { analyzeRules } from '../shared/analyze.mjs';

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(18000) });
  const data = await response.json();
  if (!response.ok) { const e = new Error(data.error || '服务请求失败'); e.status = response.status; throw e; }
  return data;
}
export async function analyze(input, mode) {
  // Offline mode never sends candidate data to the backend or to any remote provider.
  if (mode === 'offline') return { ...analyzeRules(input), location: 'browser' };
  try { return await api('/analyze', { method: 'POST', body: { ...input, mode } }); }
  catch (error) {
    if (error.status >= 400 && error.status < 500) throw error;
    return { ...analyzeRules(input), location: 'browser', fallbackReason: '本地 API 不可用或响应异常，已对当前回答执行浏览器规则分析。' };
  }
}
