import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, clone } from './harness.mjs';
import { isAdultTextSyncActor } from '../lib/scent-text-sync.mjs';
const stream = text => (async function* () { yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
const userText = r => { const c = r.messages.find(m => m.role === 'user').content; return typeof c === 'string' ? c : c.map(x => x.text || '').join(''); };
const requests = e => e.requests.filter(r => String(r.system).includes('衣物气味的记录与描写者'));
async function fixture({ failure = false, ai = true, age = 30, birthday = '', parts = ['袜子'], badWear = false } = {}) {
  const e = await createHarness({ stream: r => {
    if (String(r.system).includes('衣物气味的记录与描写者')) {
      if (failure) return stream('无效回复');
      return stream(JSON.stringify({ items: JSON.parse(userText(r)).items.map(x => ({ id: x.id, text: `棉料上的汗味已经明显，累计穿着${x.hours}小时，布料清洁度需要留意。` })) }));
    }
    if (String(r.system).includes('补录某个角色的穿着')) return stream(JSON.stringify({ 穿着: badWear ? {} : Object.fromEntries(parts.map(k => [k, { 物品: '日常棉' + k, 稀有度: 'N', 状态: '', 简介: '日常轮换使用，洗后仍能看见细小折痕', 穿着时长: '一整天', 气味: '带点汗味', 气味强度: 999, 穿着小时: 999 }])) }));
    throw new Error('意外模型请求');
  } });
  const s = e.api.defaultState(); s.gameId = 'test'; s.phase = 'play'; s.simulation = { enabled: false }; s.config.scentByAI = ai; s.config.settle = { provider: 'test', model: 'test' }; s.world.当前日期时间 = '2026年11月6日 12:00'; s.story.underSeedV2 = 1;
  s.protagonist.姓名 = '主角'; s.protagonist.性别 = '男'; s.protagonist.年龄 = 30;
  const clothes = () => Object.fromEntries(['内衣','内裤','袜子'].map(k => [k, { 物品: '日常棉' + k, 稀有度: 'N', 状态: '', 简介: '日常轮换使用，洗后仍能看见细小折痕', 气味: '旧的普通衣物记录。', 气味强度: 68, 穿着小时: 36, 穿着时长: '1天12小时', 材质: '棉', ...(k === '袜子' ? { _上一双: '日常棉袜子' } : {}) }]));
  s.npcs = [{ actorId: 'a', 姓名: '目标甲', 性别: '女', 年龄: age, 生日: birthday, 穿着: clothes() }, { actorId: 'b', 姓名: '其他乙', 性别: '女', 年龄: 30, 穿着: clothes() }];
  s.transcript = [{ role: 'assistant', seq: 0, body: '目标甲与其他乙在整理资料。', diffs: [], options: [], issues: [] }]; s.story.current_message_index = 1;
  e.seed('test', s); const loaded = await e.api.loadState('test'); e.seed('test', loaded); return { e, before: clone(loaded) };
}
test('实际重新生成服饰随后以最终68/36小时同步，而非保存一句短语', async () => {
  const { e, before } = await fixture(); try { const result = await e.call('refreshWear', { gameId: 'test', name: '目标甲' }); assert.equal(requests(e).length, 1); const items = JSON.parse(userText(requests(e)[0])).items; assert.equal(items.length, 1); assert.equal(items[0].strength, 68); assert.equal(items[0].hours, 36);
    const s = e.getState('test'); assert.match(s.npcs[0].穿着.袜子.气味, /累计穿着36小时/); assert.equal(s.npcs[0].穿着.袜子._scentTextSync.source, 'sync-model'); assert.notEqual(s.npcs[0].穿着.袜子.穿着时长, '一整天'); assert.equal(s.npcs[0].穿着.袜子._上一双, before.npcs[0].穿着.袜子._上一双); assert.deepEqual(clone(result.issues), []);
    assert.doesNotMatch(String(e.requests[0].system), /一句短语/);
  } finally { e.cleanup(); }
});
test('仅目标的已重生成部位会同步，同人其他部位和另一人全部不变', async () => {
  const { e, before } = await fixture(); try { await e.call('refreshWear', { gameId: 'test', name: '目标甲' }); const s = e.getState('test'); assert.deepEqual(s.npcs[1], before.npcs[1]); for (const k of ['内衣','内裤']) assert.deepEqual(s.npcs[0].穿着[k], before.npcs[0].穿着[k]); assert.equal(e.requests.length, 2); } finally { e.cleanup(); }
});
test('重生成贴身衣物的补值也隔离目标，不碰其他部位和全档', async () => {
  const { e, before } = await fixture({ parts: ['内衣'] }); try { await e.call('refreshWear', { gameId: 'test', name: '目标甲' }); const s = e.getState('test'); assert.deepEqual(s.npcs[1], before.npcs[1]); assert.deepEqual(s.npcs[0].穿着.袜子, before.npcs[0].穿着.袜子); assert.deepEqual(s.npcs[0].穿着.内裤, before.npcs[0].穿着.内裤); assert.equal(s.story.underSeedV2, before.story.underSeedV2); assert.equal(requests(e).length, 1); assert.equal(JSON.parse(userText(requests(e)[0])).items.length, 1); } finally { e.cleanup(); }
});
test('多部位重生成合并一次同步，并将最终衣物和来源纳入可回退diff', async () => {
  const { e, before } = await fixture({ parts: ['袜子','内衣','内裤'] }); try { await e.call('refreshWear', { gameId: 'test', name: '目标甲' }); const s = e.getState('test'); assert.equal(requests(e).length, 1); assert.equal(JSON.parse(userText(requests(e)[0])).items.length, 3); const ds = s.transcript[0].diffs; assert.equal(ds.length, 3); assert.ok(ds.every(d => d._had && Object.hasOwn(d, '_prev'))); e.api.rollbackDiffs(s, ds); assert.deepEqual(clone(s.npcs[0].穿着), before.npcs[0].穿着); } finally { e.cleanup(); }
});
test('同步失败明确返回提示，保留同件衣物旧文和数值，不自动重试', async () => {
  const { e, before } = await fixture({ failure: true }); try { const r = await e.call('refreshWear', { gameId: 'test', name: '目标甲' }); assert.equal(requests(e).length, 1); assert.equal(r.issues.length, 1); const x = e.getState('test').npcs[0].穿着.袜子; assert.equal(x.气味, before.npcs[0].穿着.袜子.气味); assert.equal(x.气味强度, 68); assert.equal(x._scentTextSync.status, 'failed'); assert.equal(e.requests.length, 2); } finally { e.cleanup(); }
});
test('不开AI文案时服饰请求仍仅一次，不触发独立同步', async () => {
  const { e } = await fixture({ ai: false }); try { await e.call('refreshWear', { gameId: 'test', name: '目标甲' }); assert.equal(requests(e).length, 0); assert.equal(e.requests.length, 1); } finally { e.cleanup(); }
});
test('未成年、生日推算未成年或年龄未知不进入新增文案同步', async () => {
  for (const options of [{ age: 17 }, { age: '', birthday: '2011-01-01' }, { age: '', birthday: '' }]) { const { e } = await fixture(options); try { await e.call('refreshWear', { gameId: 'test', name: '目标甲' }); assert.equal(requests(e).length, 0); assert.equal(e.getState('test').npcs[0].穿着.袜子.气味, ''); } finally { e.cleanup(); } }
  assert.equal(isAdultTextSyncActor({ 性别: '女', 生日: '2011-01-01' }, '2026-11-06'), false);
});
test('衣物生成本身失败时，整项不保存、不触发气味请求', async () => {
  const { e, before } = await fixture({ badWear: true }); try { await assert.rejects(e.call('refreshWear', { gameId: 'test', name: '目标甲' }), /空/); assert.deepEqual(e.getState('test'), before); assert.equal(requests(e).length, 0); } finally { e.cleanup(); }
});
