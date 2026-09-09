import test from 'node:test';
import assert from 'node:assert/strict';
import { api, analyze } from '../src/api.js';

test('frontend diagnoses missing proxy instead of leaking HTML parsing errors', async () => {
  await assert.rejects(api('/health', { fetchImpl: async () => new Response('<html>Vite page</html>', { headers: { 'content-type': 'text/html' } }) }), /代理生效/);
});
test('frontend distinguishes unavailable backend from provider failure', async () => {
  await assert.rejects(api('/health', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /npm run dev/);
  await assert.rejects(api('/analyze', { fetchImpl: async () => new Response('{"error":"模型服务返回 HTTP 401"}', { status: 502, headers: { 'content-type': 'application/json' } }) }), /HTTP 401/);
});
test('analyze only uses online API and propagates failure', async t => {
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    assert.equal(JSON.parse(options.body).mode, 'online');
    return new Response('{"error":"模型不可用"}', { status: 502, headers: { 'content-type': 'application/json' } });
  });
  await assert.rejects(analyze({ jd: '职位', resume: '经历', answer: '回答', mode: 'offline' }), /模型不可用/);
});
