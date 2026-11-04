import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';

const reply = (text) => (async function* () { yield {type: 'text-delta', index: 0, text}; yield {type: 'finish', reason: {kind: 'stop'}}; })();
const ANSWER = JSON.stringify({
  性癖: ['怕痒', '恋足', '洁癖'],
  敏感点: ['耳', '后颈'],
  敏感度: {耳: 40, 后颈: 30},
  底线: ['不拿别人的答案充自己的，也不在别人面前提我家里的事'],
  经验: ['足：熟悉', '手：生涩', '耳: 未涉足'],
});

async function rig(npc) {
  const e = await createHarness({stream: () => reply(ANSWER)});
  const s = e.api.defaultState();
  s.gameId = 'test'; s.phase = 'play';
  s.world.当前日期时间 = '2010年11月1日 12:00:00 晴';
  s.config.settle = {provider: 'test', model: 'test'};
  s.npcs = [npc];
  e.seed('test', s);
  return e;
}

test('处女刷新时六个部位经验强制未涉足，性格词不进性癖，底线裁到 16 字', async () => {
  const e = await rig({姓名: '苏清越', 性别: '女', 年龄: 19, 是否处女: '是'});
  try {
    const r = await e.call('refreshSecrets', {gameId: 'test', name: '苏清越'});
    const n = e.getState('test').npcs[0];
    assert.deepEqual(n.经验, ['口：未涉足', '手：未涉足', '足：未涉足', '乳：未涉足', '穴：未涉足', '肛：未涉足']);
    assert.deepEqual(n.性癖, ['恋足']);
    assert.equal(n.底线.length, 1);
    assert.ok(n.底线[0].length <= 16, '底线不超过 16 字：' + n.底线[0]);
    assert.equal(r.ok, true);
  } finally {
    e.cleanup();
  }
});

test('非处女照模型给的经验走，但性癖仍过滤性格词', async () => {
  const e = await rig({姓名: '苏清越', 性别: '女', 年龄: 25, 是否处女: '否'});
  try {
    await e.call('refreshSecrets', {gameId: 'test', name: '苏清越'});
    const n = e.getState('test').npcs[0];
    assert.deepEqual(n.经验, ['足：熟悉', '手：生涩', '耳: 未涉足']);
    assert.deepEqual(n.性癖, ['恋足']);
  } finally {
    e.cleanup();
  }
});

test('请求里带上是否处女与现有字段，让模型知道底细', async () => {
  const e = await rig({姓名: '苏清越', 性别: '女', 年龄: 19, 是否处女: '是', 经验: ['足：熟悉']});
  try {
    await e.call('refreshSecrets', {gameId: 'test', name: '苏清越'});
    const user = e.requests.map((r) => JSON.stringify(r.messages || '')).join('\n');
    assert.match(user, /是否处女：是/);
    assert.match(user, /现有经验：足：熟悉/);
  } finally {
    e.cleanup();
  }
});
