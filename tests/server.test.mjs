import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.mjs';
import { once } from 'node:events';

const input = { jd: '需要 Redis 缓存优化能力。', resume: '负责缓存优化。', answer: '我负责查询 Redis 并回填缓存。', mode: 'online' };
const config = { baseUrl: 'http://127.0.0.1:9999/v1/chat/completions', model: 'test-model', apiKey: '' };
const response = content => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'content-type': 'application/json' } });

async function client(t, fetchImpl) {
  const server = createApp({ fetchImpl });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  let cookie = '';
  return async (path, body, method = 'POST') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { 'content-type': 'application/json', cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.headers.has('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return { status: res.status, data: await res.json() };
  };
}

test('online analysis needs configuration; offline mode is rejected without provider calls', async t => {
  const call = await client(t, () => { assert.fail('must not call provider'); });
  const unconfigured = await call('/analyze', input);
  assert.equal(unconfigured.status, 409);
  assert.equal(unconfigured.data.score, undefined);
  const offline = await call('/analyze', { ...input, mode: 'offline' });
  assert.equal(offline.status, 400);
  assert.equal(offline.data.score, undefined);
});

test('full endpoint connects, saves without requests, then analyzes and caches successful online results', async t => {
  let calls = 0;
  const call = await client(t, async (url, init) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:9999/v1/chat/completions');
    const messages = JSON.parse(init.body).messages;
    return response(messages.length === 1 ? '{"ok":true}' : JSON.stringify({ evidence: [{ dimension: '个人贡献', quote: '我负责查询 Redis 并回填缓存。' }], missing: ['量化结果'] }));
  });
  assert.equal((await call('/models/test', config)).status, 200);
  assert.equal((await call('/models', config)).status, 200);
  assert.equal(calls, 1);
  const result = await call('/analyze', input);
  assert.equal(result.status, 200);
  assert.equal(result.data.mode, 'online-assisted');
  assert.equal(result.data.fallbackReason, undefined);
  assert.equal(result.data.modelObservations.evidence[0].quote, input.answer);
  assert.equal((await call('/analyze', input)).data.cached, true);
  assert.equal(calls, 2);
  assert.equal((await call('/session', null, 'DELETE')).status, 200);
  assert.equal((await call('/analyze', input)).status, 409);
});

for (const failure of ['http', 'network', 'malformed', 'fabricated']) {
  test(`${failure} failure never returns or caches a replacement rules report`, async t => {
    let calls = 0;
    const call = await client(t, async () => {
      calls++;
      if (failure === 'http') return new Response('SECRET', { status: 500 });
      if (failure === 'network') throw new Error('SECRET');
      return response(failure === 'malformed' ? 'not-json' : '{"evidence":[{"dimension":"个人贡献","quote":"编造的证据"}],"missing":[]}');
    });
    await call('/models', config);
    for (let i = 0; i < 2; i++) {
      const result = await call('/analyze', input);
      assert.equal(result.status, 502);
      assert.equal(result.data.score, undefined);
      assert.equal(result.data.mode, undefined);
      assert.equal(result.data.fallbackReason, undefined);
      assert.ok(!JSON.stringify(result.data).includes('SECRET'));
    }
    assert.equal(calls, 2);
  });
}
