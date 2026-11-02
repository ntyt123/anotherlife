import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, clone } from './harness.mjs';

const fixture = (env) => { const s = env.api.defaultState(); s.gameId = 'test'; s.phase = 'play'; s.story.current_message_index = 1; s.world.当前日期时间 = '2020年1月1日 09:00'; s.protagonist.姓名 = '测试玩家'; s.transcript = [{ seq: 0, role: 'assistant', body: '测试开场。', diffs: [] }]; return s; };
test('实际宿主完整注册，不会重复接口', async () => { const e = await createHarness(); assert.ok(e.handles.size >= 128); e.cleanup(); });
test('两个真实 saveFields 并发请求都能保存', async () => {
  const e = await createHarness(); e.seed('test', fixture(e));
  await Promise.all([e.call('saveFields', { gameId: 'test', patch: { extraInfo: '修改甲' } }), e.call('saveFields', { gameId: 'test', patch: { skin: 'dark' } })]);
  const s = e.getState('test'); assert.equal(s.extraInfo, '修改甲'); assert.equal(s.skin, 'dark'); e.cleanup();
});
test('getState 读取不会写回主存档', async () => {
  const e = await createHarness(); const s = fixture(e); s.config.scentByAI = true; s.npcs = [{ 姓名: '测试角色', 穿着: { 袜子: { 物品: '测试物品', 气味: '测试文本', 气味强度: 20 } } }]; e.seed('test', s);
  const before = e.files.get(e.api.statePath('test')); await e.call('getState', { gameId: 'test' });
  assert.equal(e.files.get(e.api.statePath('test')), before); assert.equal(e.writes.filter((key) => key === e.api.statePath('test')).length, 0); e.cleanup();
});
test('坏主档使用有效备份，保存前保留损坏现场', async () => {
  const e = await createHarness(); e.files.set(e.api.statePath('test'), '{损坏'); e.files.set(e.api.backupPath('test'), JSON.stringify(fixture(e)));
  const s = await e.api.loadState('test'); assert.equal(s.protagonist.姓名, '测试玩家'); assert.equal(s.recoveryInfo.source, 'backup');
  await e.api.saveState(s); assert.ok([...e.files.keys()].some((key) => key.includes('.corrupt-'))); assert.equal(e.getState('test').protagonist.姓名, '测试玩家'); e.cleanup();
});
test('坏主档没有有效备份时明确失败，不返回新档', async () => {
  const e = await createHarness(); e.files.set(e.api.statePath('test'), '{损坏'); await assert.rejects(e.api.loadState('test'), /损坏/); e.cleanup();
});
test('实际差分与直接路径写入均阻止原型污染', async () => {
  const e = await createHarness(); const s = fixture(e); e.api.applyDiffs(s, [{ path: ['protagonist', '__proto__', 'polluted'], to: true }]);
  assert.equal(e.api.getByPath(s, ['protagonist', 'polluted']), undefined); assert.throws(() => e.api.setByPath(s, ['protagonist', '__proto__', 'polluted'], true)); e.cleanup();
});
test('新格式回退恢复月结和出场元数据', async () => {
  const e = await createHarness(); const s = fixture(e); s.story.current_message_index = 2; s._收支结算月 = 2020 * 12 + 1; s.npcs = [{ 姓名: '角色甲', 最近出场: 1 }];
  s.transcript.push({ seq: 1, role: 'assistant', body: '角色甲', diffs: [{ path: ['_收支结算月'], _had: true, _prev: 2020 * 12, to: 2020 * 12 + 1 }, { path: ['npcs', 0, '最近出场'], _had: true, _prev: 0, to: 1 }] });
  await e.api.truncateFrom(s, 1); assert.equal(s._收支结算月, 2020 * 12); assert.equal(s.npcs[0].最近出场, 0); e.cleanup();
});
test('最近原文轮数按设定值执行', async () => {
  const e = await createHarness(); for (const n of [1, 10, 25, 60]) assert.equal(e.api.recentRounds({ config: { recentRounds: n } }), n); e.cleanup();
});
test('AI 模式迁移无变化不再虚报更改', async () => {
  const e = await createHarness(); const s = fixture(e); s.config.scentByAI = true; s.npcs = [{ 姓名: '测试角色', 穿着: { 袜子: { 物品: '物品', 气味: '文本', 气味强度: 20 } } }];
  const before = clone(s); assert.equal(e.api.migrateScentText(s), 0); assert.deepEqual(clone(s), before); e.cleanup();
});
test('内容不同但旧指纹相同的头像不再冲突', async () => {
  const e = await createHarness(); const prefix = 'data:image/png;base64,' + 'A'.repeat(40), suffix = 'Z'.repeat(40);
  const a = await e.api.avatarToFile('角色甲', prefix + 'B'.repeat(100) + suffix); const b = await e.api.avatarToFile('角色甲', prefix + 'C'.repeat(100) + suffix); assert.notEqual(a, b); e.cleanup();
});
test('实际日志保留第三参数和正确总结日志文件名', async () => {
  const e = await createHarness(); await e.api.appendLog('summary', 'block', '诊断详情'); assert.ok([...e.files].some(([key, value]) => key.endsWith('simulator-summary.log') && value.includes('诊断详情'))); e.cleanup();
});
test('助手断流重试可执行，失败也清除运行标记', async () => {
  const e = await createHarness({ stream: () => ({ [Symbol.asyncIterator]() { return { next: async () => { throw Error('SSE stream ended without [DONE]'); }, return: async () => ({ done: true }) }; } }) });
  const s = fixture(e); s.config.oracleAgent = false; s.config.assistant = { provider: 'test', model: 'test-model' }; e.seed('test', s);
  await assert.rejects(e.call('assistantChat', { gameId: 'test', text: '测试问题' }), /SSE/); assert.ok(e.requests.length >= 2); assert.equal(e.api.RUNNING.has('test'), false); e.cleanup();
});
