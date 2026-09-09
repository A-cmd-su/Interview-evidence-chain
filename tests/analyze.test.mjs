import assert from 'node:assert/strict';
import { analyzeRules, dueAfterTwoDays, profile, trainingFor } from '../shared/analyze.mjs';

const input = { jd: 'Java 后端需要 Redis 缓存、高并发和故障降级。', resume: '负责系统优化。', answer: '我们使用 Redis 缓存商品详情，未命中查询数据库并回填。' };
const report = analyzeRules(input, new Date('2026-09-09T00:00:00.000Z'));
assert.equal(report.mode, 'rules');
assert.equal(report.score, null, 'evidence-incomplete score must not be fabricated');
assert.ok(report.missing.includes('个人贡献'));
assert.ok(report.missing.includes('量化结果'));
assert.equal(report.consistency[0].type, '待澄清');
assert.ok(report.scores.some(s => s.status === 'insufficient_evidence'));
assert.ok(report.evidence.every(e => e.requirementId && e.knowledgeId));
assert.equal(profile(input.jd).skills[0].id, 'redis');
assert.equal(trainingFor(report).length, report.missing.length);
assert.equal(dueAfterTwoDays(new Date('2026-09-09T00:00:00.000Z')), '2026-09-11T00:00:00.000Z');
console.log('shared analysis tests passed');
