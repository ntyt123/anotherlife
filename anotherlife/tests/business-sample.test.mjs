import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createHarness } from './harness.mjs';
import { BASIC_WEAR_KEYS } from '../lib/data-integrity.mjs';
const samplePath = process.env.SIMULATOR_BUSINESS_SAMPLE_PATH;
const digest = (x) => crypto.createHash('sha256').update(x).digest('hex');
const narratives = (s) => JSON.stringify(s.transcript.map((t) => ({ seq: t.seq, role: t.role, body: t.body, think: t.think, summary: t.summary, sent: t.sent })));
function outfit(wear = {}) {
  return Object.fromEntries(BASIC_WEAR_KEYS.map((k) => {
    const old = wear[k] && typeof wear[k] === 'object' ? wear[k] : {};
    const item = old.物品 || ({ 上衣: '日常上衣', 下衣: '普通长裤', 鞋子: '平底便鞋' }[k] || '');
    return [k, { 物品: item, 稀有度: item ? old.稀有度 || 'N' : '', 状态: old.状态 || '', 简介: item ? String(old.简介 || '').length >= 10 && String(old.简介).length <= 25 ? old.简介 : '按日常活动选用，表面保留洗净后的折痕' : '' }];
  }));
}
test('本局副本：补资料和旧空群展示，不动原档正文摘要余额', { skip: !samplePath }, async () => {
  const bytes = fs.readFileSync(samplePath), originalHash = digest(bytes), s = JSON.parse(bytes.toString('utf8'));
  const gid = String(s.gameId), money = s.protagonist.金钱, text = narratives(s), summaries = JSON.stringify(s.summaries);
  let e; e = await createHarness({ stream: () => (async function* () {
    yield { type: 'tool-call-delta', id: 'sample-repair', index: 0, name: 'complete_records', argumentsDelta: JSON.stringify({ protagonist: { 穿着: outfit(s.protagonist.穿着), 住所: [{ 名称: '副本测试住宅', 总面积: 93, 楼层: 3, 户型: '两房', 产权人: s.protagonist.姓名, 买入价格: '' }] }, chars: s.npcs.map((n) => ({ 姓名: n.姓名, 穿着: outfit(n.穿着) })), 实体资产: [{ 名称: '副本测试办公室', 类型: '经营场所', 产权: '租赁', 总面积: 42 }] }) };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  })() });
  e.seed(gid, s);
  const groups = await e.call('phoneGroupList', { gameId: gid, 平台: 'wechat' }), threads = await e.call('phoneThreads', { gameId: gid, 平台: 'wechat' });
  assert.ok(groups.groups.length >= 1); assert.ok(threads.threads.some((t) => t.是否群 && t.条数 === 0));
  await e.call('repairBasicData', { gameId: gid }); const saved = e.getState(gid);
  assert.equal(saved.protagonist.金钱, money); assert.equal(narratives(saved), text); assert.equal(JSON.stringify(saved.summaries), summaries);
  assert.equal(saved.protagonist.住所.length, s.protagonist.住所.length + 1); assert.ok(saved.实体资产.length); assert.equal(saved.npcs.length, s.npcs.length); assert.equal(e.requests.length, 1);
  assert.ok(saved.npcs.every((n) => n.穿着.上衣.物品 || n.穿着.下衣.物品)); assert.ok(e.writes.every((p) => p.startsWith('memory/')));
  assert.equal(digest(fs.readFileSync(samplePath)), originalHash); e.cleanup();
});
