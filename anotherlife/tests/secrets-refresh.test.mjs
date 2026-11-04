import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {loadClient} from './client-harness.mjs';

const walk = (node, out = []) => { if (Array.isArray(node)) node.forEach((n) => walk(n, out)); else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); } return out; };
const reply = (text) => (async function* () { yield {type: 'text-delta', index: 0, text}; yield {type: 'finish', reason: {kind: 'stop'}}; })();
const json = JSON.stringify({性癖: ['恋足'], 敏感点: ['后颈'], 敏感度: {后颈: 70}, 底线: ['不接受被拍照'], 经验: ['口：生涩']});

async function rig(npc, answer = json) {
  const e = await createHarness({stream: () => reply(answer)});
  const s = e.api.defaultState();
  s.gameId = 'test'; s.phase = 'play';
  s.world.当前日期时间 = '2010年11月1日 12:00:00 晴';
  s.config.settle = {provider: 'test', model: 'test'};
  s.npcs = [npc];
  e.seed('test', s);
  return e;
}

test('成年角色可以补录私密设定并写回存档', async () => {
  const e = await rig({姓名: '苏清越', 性别: '女', 年龄: 19, 身份: '学生'});
  try {
    const r = await e.call('refreshSecrets', {gameId: 'test', name: '苏清越'});
    assert.equal(r.ok, true);
    const n = e.getState('test').npcs[0];
    assert.deepEqual(n.性癖, ['恋足']);
    assert.deepEqual(n.敏感点, ['后颈']);
    assert.equal(n.敏感度.后颈, 70);
    assert.deepEqual(n.底线, ['不接受被拍照']);
    assert.deepEqual(n.经验, ['口：生涩']);
    assert.equal(e.requests.length, 1);
  } finally {
    e.cleanup();
  }
});

test('未满 18 岁直接拒绝，不调用模型', async () => {
  const e = await rig({姓名: '罗瑶', 性别: '女', 年龄: 15, 身份: '学生'});
  try {
    await assert.rejects(() => e.call('refreshSecrets', {gameId: 'test', name: '罗瑶'}), /未满 18 岁/);
    assert.equal(e.requests.length, 0);
    assert.equal(e.getState('test').npcs[0].性癖, undefined);
  } finally {
    e.cleanup();
  }
});

test('模型给出空内容时不覆盖原字段', async () => {
  const e = await rig({姓名: '苏清越', 性别: '女', 年龄: 19, 性癖: ['恋足']}, '{"性癖":[],"敏感点":[]}');
  try {
    await assert.rejects(() => e.call('refreshSecrets', {gameId: 'test', name: '苏清越'}), /没给出可用/);
    assert.deepEqual(e.getState('test').npcs[0].性癖, ['恋足']);
  } finally {
    e.cleanup();
  }
});

test('角色详情的私密标题栏有刷新按钮', async () => {
  const e = await createHarness();
  const state = e.api.defaultState();
  e.cleanup();
  state.gameId = 'test'; state.phase = 'play';
  state.npcs = [{actorId: 'npc:one', 姓名: '苏清越', 性别: '女', 年龄: 19}];
  const c = loadClient(async () => ({ok: true}));
  c.render().functions.initLoaded(state);
  c.render().functions.openNpcByActorId('npc:one');
  const btn = walk(c.render().functions.npcModalView()).find((n) => typeof n.props?.title === 'string' && n.props.title.includes('补录私密设定'));
  assert.ok(btn, '私密标题应有刷新按钮');
  assert.equal(typeof btn.props.onClick, 'function');
});

test('结算提示改为建档给初值，并保留未成年与模板化约束', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../lib/prompt-defaults.mjs', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src + index, /新角色出场时这四项一律写「未知」/);
  assert.match(src, /新角色建档时就把这四项的初值给出来/);
  assert.match(src, /不许套模板/);
  assert.match(src, /未满 18 岁的角色，这四项一律留空/);
});
