import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfig, parseEvidence, completion, ProviderError } from '../server/provider.mjs';

const base = { baseUrl: 'https://api.example.com/v1', model: 'demo-model', apiKey: 'secret' };

test('provider config accepts HTTPS public endpoint and normalizes slash', () => {
  assert.deepEqual(validateConfig({ ...base, baseUrl: 'https://api.example.com/v1/' }), { ...base, baseUrl: 'https://api.example.com/v1', jsonMode: false });
});

test('provider config rejects unsafe remote URLs', () => {
  for (const baseUrl of ['http://api.example.com/v1', 'https://192.168.1.20/v1', 'https://service.local/v1', 'https://api.example.com/v1/chat/completions']) {
    assert.throws(() => validateConfig({ ...base, baseUrl }), /地址|远程|私有|根地址/);
  }
  assert.throws(() => validateConfig({ ...base, apiKey: '', baseUrl: 'https://api.example.com/v1' }), /API Key/);
});

test('parseEvidence rejects quotes not present in answer', () => {
  assert.throws(() => parseEvidence(JSON.stringify({ evidence: [{ dimension: '技术深度', quote: '不存在的句子' }], missing: [] }), { answer: '回答原文' }), ProviderError);
});

test('completion parses a compatible JSON response without exposing provider body', async () => {
  const result = await completion(base, [{ role: 'user', content: 'hi' }], {
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.example.com/v1/chat/completions');
      assert.equal(init.headers.authorization, 'Bearer secret');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }, timeout: 1000,
  });
  assert.equal(result, '{"ok":true}');
});

test('completion converts provider failures to safe errors', async () => {
  await assert.rejects(() => completion(base, [], { fetchImpl: async () => new Response('private-provider-secret', { status: 500 }), timeout: 1000 }), /HTTP 500/);
  await assert.rejects(() => completion(base, [], { fetchImpl: async () => { throw new Error('private-provider-secret'); }, timeout: 1000 }), /连接失败或超时/);
});

