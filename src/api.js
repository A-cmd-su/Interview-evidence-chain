export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(65000) });
  const data = await response.json();
  if (!response.ok) { const e = new Error(data.error || '服务请求失败'); e.status = response.status; throw e; }
  return data;
}
export async function analyze(input) {
  return api('/analyze', { method: 'POST', body: { ...input, mode: 'online' } });
}
