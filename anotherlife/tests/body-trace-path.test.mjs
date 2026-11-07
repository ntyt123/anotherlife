import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, clone } from './harness.mjs';
const mark = (strength = 40) => ({ 描述: '背包压出的普通红印', 强度: strength });
const state = body => ({ protagonist: { 姓名: '主角甲', 身体: body }, npcs: [] });
async function unit(run) { const e = await createHarness(); try { await run(e.api); } finally { e.cleanup(); } }

test('主角数值衰减的真实路径与记录一致，回滚不产生根级身体', () => unit(api => {
  const s = state({ 左肩: mark() }), before = clone(s), ds = api.tickBodyTraces(s, 1);
  assert.equal(s.protagonist.身体.左肩.强度, 38.5); assert.equal(ds.length, 1);
  assert.deepEqual(clone(ds[0].path), ['protagonist','身体','左肩','强度']); assert.equal(ds[0]._prev, 40);
  api.rollbackDiffs(s, ds); assert.deepEqual(clone(s), before); assert.equal(Object.hasOwn(s, '身体'), false);
}));
test('主角痕迹消退到零的整对象路径正确，回滚恢复描述和强度', () => unit(api => {
  const s = state({ 左肩: mark(1) }), before = clone(s), ds = api.tickBodyTraces(s, 1);
  assert.deepEqual(clone(s.protagonist.身体.左肩), { 描述: '', 强度: 0 });
  assert.deepEqual(clone(ds[0].path), ['protagonist','身体','左肩']);
  api.rollbackDiffs(s, ds); assert.deepEqual(clone(s), before); assert.equal(Object.hasOwn(s, '身体'), false);
}));
test('主角旧字符串转换同样记录规范路径，回滚恢复原字符串', () => unit(api => {
  const s = state({ 右手: '普通擦伤' }), before = clone(s), ds = api.tickBodyTraces(s, 1);
  assert.deepEqual(clone(s.protagonist.身体.右手), { 描述: '普通擦伤', 强度: 55 });
  assert.deepEqual(clone(ds[0].path), ['protagonist','身体','右手']);
  api.rollbackDiffs(s, ds); assert.deepEqual(clone(s), before);
}));
test('同轮主角和NPC多处痕迹各归其人，整批回滚准确恢复', () => unit(api => {
  const s = state({ 左肩: mark(), 右手: { 描述: '普通擦伤', 强度: 20 } });
  s.npcs = [{ 姓名: '成年乙', 年龄: 30, 身体: { 左肩: mark(15) } }]; const before = clone(s), ds = api.tickBodyTraces(s, 2);
  assert.equal(ds.length, 3); assert.ok(ds.slice(0, 2).every(d => d.path[0] === 'protagonist'));
  assert.deepEqual(clone(ds[2].path), ['npcs',0,'身体','左肩','强度']);
  api.rollbackDiffs(s, ds); assert.deepEqual(clone(s), before);
}));
test('NPC原有路径和消退速率保持不变', () => unit(api => {
  const s = state({}); s.npcs = [{ 身体: { 左肩: mark() } }]; const before = clone(s), ds = api.tickBodyTraces(s, 1);
  assert.equal(s.npcs[0].身体.左肩.强度, 38.5); assert.deepEqual(clone(ds[0].path), ['npcs',0,'身体','左肩','强度']);
  api.rollbackDiffs(s, ds); assert.deepEqual(clone(s), before);
}));
test('零步长、倒退及无效步长不修改身体数据', () => unit(api => {
  for (const dh of [0, -1, undefined, NaN]) { const s = state({ 左肩: mark() }), before = clone(s); assert.deepEqual(clone(api.tickBodyTraces(s, dh)), []); assert.deepEqual(clone(s), before); }
}));
test('旧根级残留不猜归属、不自动搬移或删除', () => unit(api => {
  const s = state({}); s.身体 = { 左肩: mark() }; const before = clone(s);
  assert.deepEqual(clone(api.tickBodyTraces(s, 1)), []); assert.deepEqual(clone(s), before);
}));
const reply = text => (async function* () { yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
test('实际正文结算保存主角规范痕迹diff，删轮恢复且不污染根目录', async () => {
  const e = await createHarness({ stream: r => String(r.system).includes('后台变量结算器') ? reply(JSON.stringify({ world: { 当前日期时间: '2026年11月6日 13:00' }, summary: '普通日常继续。' })) : reply('主角甲整理好日常资料，继续完成手头的工作。') });
  try {
    const s = e.api.defaultState(); s.gameId = 'test'; s.phase = 'play'; s.config.toolMode = false; s.config.scentByAI = false; s.config.settle = { provider: 'test', model: 'test' }; s.simulation = { enabled: false };
    s.protagonist.姓名 = '主角甲'; s.protagonist.性别 = '男'; s.protagonist.年龄 = 30; s.protagonist.身体 = { 左肩: mark() }; s.npcs = [];
    s.world.当前日期时间 = '2026年11月6日 12:00'; s.story.sockTick = new Date(2026, 10, 6, 12, 0).getTime() / 60000; s.story.current_message_index = 1;
    s.transcript = [{ role: 'assistant', seq: 0, body: '普通开局。', diffs: [], options: [], issues: [] }];
    e.seed('test', s); await e.call('generateStory', { gameId: 'test', input: '继续一小时后的日常' }); const after = e.getState('test');
    assert.equal(after.protagonist.身体.左肩.强度, 38.5); const ds = after.transcript.filter(t => t.role === 'assistant').at(-1).diffs.filter(d => d.by === 'trace');
    assert.equal(ds.length, 1); assert.deepEqual(ds[0].path, ['protagonist','身体','左肩','强度']);
    await e.api.truncateFrom(after, 1); assert.equal(after.protagonist.身体.左肩.强度, 40); assert.equal(Object.hasOwn(after, '身体'), false);
  } finally { e.cleanup(); }
});
