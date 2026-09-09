import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { analyzeRules, validateInput, RULE_VERSION, SCHEMA_VERSION } from '../shared/analyze.mjs';
import { validateConfig, completion, onlineAnalysis, ProviderError } from './provider.mjs';

const TTL = 2 * 60 * 60 * 1000;
function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('需要 application/json');
  let bytes = 0, chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 200000) throw new Error('请求体过大'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('请求 JSON 无法解析'); }
}
export function createApp(options = {}) {
  const sessions = new Map();
  const origins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173']);
  return http.createServer(async (req, res) => {
    // Local-only development service. No wildcard CORS, no public deployment implied.
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return json(res, 403, { error: 'Host 不被允许' });
    if (req.headers.origin && !origins.has(req.headers.origin)) return json(res, 403, { error: '来源不被允许' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '拒绝跨站请求' });
    try {
      const now = Date.now();
      for (const [id, s] of sessions) if (s.expires < now) sessions.delete(id);
      let sid = (req.headers.cookie || '').match(/(?:^|;\s*)evidence_sid=([\w-]+)/)?.[1];
      if (!sessions.has(sid)) {
        if (sessions.size >= 100) return json(res, 429, { error: '会话数量已达上限' });
        sid = crypto.randomUUID(); sessions.set(sid, { config: null, cache: new Map(), expires: now + TTL, busy: false });
        res.setHeader('set-cookie', `evidence_sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200`);
      }
      const s = sessions.get(sid), path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, configured: Boolean(s.config), model: s.config?.model || null });
      if (req.method === 'DELETE' && path === '/api/session') {
        sessions.delete(sid); res.setHeader('set-cookie', 'evidence_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); return json(res, 200, { ok: true });
      }
      if (req.method !== 'POST') return json(res, 404, { error: '接口不存在' });
      const body = await readBody(req);
      if (path === '/api/models/test' || path === '/api/models') {
        const config = validateConfig(body);
        if (s.busy) return json(res, 429, { error: '当前已有模型请求，请稍后重试' });
        if (path.endsWith('/test')) {
          s.busy = true;
          try {
            const start = Date.now(); await completion(config, [{ role: 'user', content: 'Return a JSON object {"ok":true}.' }], { ...options, maxTokens: 512 });
            return json(res, 200, { ok: true, latencyMs: Date.now() - start, message: '聊天接口响应成功；不代表语义评分质量或 JSON Schema 能力已验证。' });
          } finally { s.busy = false; }
        }
        s.config = config; s.cache.clear();
        return json(res, 200, { ok: true, model: config.model, stored: 'session-memory-only', tested: false });
      }
      if (path === '/api/analyze') {
        validateInput(body);
        if (!['offline', 'online'].includes(body.mode)) throw new Error('mode 必须为 offline 或 online');
        const input = Object.fromEntries(['jd', 'resume', 'answer', 'question', 'skill', 'asked'].filter(k => body[k] !== undefined).map(k => [k, body[k]]));
        const key = crypto.createHash('sha256').update(JSON.stringify({ input, mode: body.mode, config: s.config, version: RULE_VERSION, schema: SCHEMA_VERSION })).digest('hex');
        if (s.cache.has(key)) return json(res, 200, { ...s.cache.get(key), cached: true });
        let result = analyzeRules(input);
        if (body.mode === 'online') {
          if (!s.config) result.fallbackReason = '未配置模型，已使用规则分析';
          else {
            if (s.busy) return json(res, 429, { error: '当前已有模型请求，请稍后重试' });
            s.busy = true;
            try {
              const model = await onlineAnalysis(input, s.config, options);
              // Model observations supplement the report; all numeric scores remain deterministic rubric scores.
              result = { ...result, mode: 'online-assisted', model: s.config.model, modelObservations: model,
                warning: `${result.warning} 在线语义观察仅作补充，分数仍由固定量表产生。` };
            } catch (e) { result.fallbackReason = e instanceof ProviderError ? e.message : '在线分析未完成，已使用规则分析'; }
            finally { s.busy = false; }
          }
        }
        if (!result.fallbackReason) { if (s.cache.size >= 40) s.cache.delete(s.cache.keys().next().value); s.cache.set(key, result); }
        return json(res, 200, result);
      }
      return json(res, 404, { error: '接口不存在' });
    } catch (e) { return json(res, e instanceof ProviderError ? 502 : 400, { error: e.message }); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(Number(process.env.PORT || 8787), '127.0.0.1', () => console.log('Evidence API: http://127.0.0.1:8787'));
}
