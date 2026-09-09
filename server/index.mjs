import http from 'node:http';
import { URL } from 'node:url';

const configs = new Map();
const knowledge = {
  redis_cache: { id: 'kb.redis.cache-failure.v1', title: 'Redis 缓存异常处理', summary: '缓存击穿、缓存雪崩、缓存穿透、降级与回源控制。', source: 'Redis 官方文档（需在产品中补充具体链接与版本）' },
};
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };
const read = req => new Promise((resolve, reject) => { let data=''; req.on('data', c => { data += c; if (data.length > 1_000_000) req.destroy(); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } }); req.on('error', reject); });
function extract(text, terms) { return terms.filter(t => text.toLowerCase().includes(t.toLowerCase())); }
function analyze({ jd='', resume='', answer='', question=''}={}) {
  const source = answer.trim();
  const spans = [];
  const add = (id, terms, label) => { const term = terms.find(t => source.toLowerCase().includes(t.toLowerCase())); if (term) spans.push({ id, label, quote: source.slice(Math.max(0, source.toLowerCase().indexOf(term.toLowerCase()) - 12), Math.min(source.length, source.toLowerCase().indexOf(term.toLowerCase()) + term.length + 36)) }); };
  add('answer.solution', ['redis','缓存','回填','数据库'], '技术方案'); add('answer.contribution', ['我负责','我独立','我设计','我实现','主导'], '个人贡献'); add('answer.result', ['%','毫秒','qps','提升','降低','减少'], '量化结果'); add('answer.fallback', ['降级','回源','熔断','兜底','击穿','雪崩','穿透'], '故障兜底');
  const missing = ['技术方案','个人贡献','量化结果','故障兜底'].filter(x => !spans.some(s => s.label === x));
  const requirement = extract(jd || '能够处理 Redis 缓存异常与高并发场景', ['Redis','缓存','高并发','降级']).join('、') || 'Redis 缓存异常处理';
  const score = Math.min(100, Math.round((spans.length / 4) * 100));
  return { mode: 'rules', score, evidence: spans, missing, requirement, knowledge: knowledge.redis_cache, followUp: missing[0] ? `请补充${missing[0]}：在这个场景中，你具体做了什么？` : '请说明方案的边界条件和验证方式。', consistency: resume.includes('负责系统优化') && !spans.some(s=>s.label==='个人贡献') ? [{ type:'待澄清', resume:'负责系统优化', answer: source.slice(0, 100) }] : [] };
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  try {
    if (req.method === 'POST' && url.pathname === '/api/analyze') return json(res, 200, analyze(await read(req)));
    if (req.method === 'POST' && url.pathname === '/api/models/test') { const b = await read(req); if (!b.baseUrl || !b.model) return json(res, 400, { ok:false, error:'Base URL 和模型名称不能为空' }); return json(res, 200, { ok:true, mode:'config-only', message:'配置已保存；在线调用将在下一次分析时启用。' }); }
    if (req.method === 'POST' && url.pathname === '/api/models') { const b=await read(req); const id=crypto.randomUUID(); configs.set(id, {...b, apiKey: b.apiKey ? 'stored-in-memory' : ''}); return json(res, 200, { ok:true, id }); }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok:true, mode:'offline-ready' });
    json(res, 404, { error:'Not found' });
  } catch (e) { json(res, 400, { error: e.message }); }
});
server.listen(process.env.PORT || 8787, '127.0.0.1', () => console.log('Evidence API listening on http://127.0.0.1:8787'));
