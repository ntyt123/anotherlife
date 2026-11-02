import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';

function stateOf(env) { const state = env.api.defaultState(); state.gameId = 'test'; state.phase = 'play'; state.protagonist.姓名 = '玩家'; state.world.当前日期时间 = '2020年1月31日 09:00'; state.story.current_message_index = 1; state.transcript = [{ seq: 0, role: 'assistant', body: '开场', diffs: [] }]; return state; }
const textStream = (text) => (async function* () { yield { type: 'text-delta', text, index: 0 }; yield { type: 'finish', reason: { kind: 'stop' } }; })();

test('实际生成通道清理多组笔记及选项后续正文', async () => {
  const e = await createHarness({ stream: () => textStream('<导演笔记>第一组</导演笔记>正文甲\n<think>第二组</think>正文乙\n[行动选项]\n[稳健路线] 做法甲\n[激进路线] 做法乙\n继续的正文') });
  const state = stateOf(e); const entry = await e.api.runTurn(state, '测试行动', '测试行动', { gameId: 'test' });
  assert.ok(!entry.body.includes('导演笔记') && !entry.body.includes('<think>')); assert.ok(entry.body.includes('继续的正文')); assert.ok(!entry.options.includes('继续的正文')); assert.equal(entry.options.length, 2); e.cleanup();
});
test('工具 game_content 只有笔记时失败，不把原标签回填', async () => {
  const e = await createHarness({ stream: () => (async function* () { yield { type: 'tool-call-delta', id: 'game-1', name: e.api.STORY_SUBMIT_TOOL.name, index: 0, argumentsDelta: JSON.stringify({ game_content: '<导演笔记>只有笔记</导演笔记>' }) }; yield { type: 'finish', reason: { kind: 'tool-calls' } }; })() });
  const state = stateOf(e); state.config.toolMode = true; assert.equal(e.api.toolModeOf(state), true);
  await assert.rejects(e.api.runTurn(state, '测试行动', '测试行动', { gameId: 'test' }), /没有返回正文|正文为空|工具/); e.cleanup();
});
test('三工具调用都得到 tool-result，包括超预算的第三个', async () => {
  const e = await createHarness({ stream: (options, count) => count === 1 ? (async function* () { for (let i = 1; i <= 3; i++) yield { type: 'tool-call-delta', index: i - 1, id: 't' + i, name: 'read_turns', argumentsDelta: JSON.stringify({ from: 0, to: 0 }) }; yield { type: 'finish', reason: { kind: 'tool-calls' } }; })() : textStream('最终正文') });
  const state = stateOf(e); state.config.storyTools = true; state.config.storyToolsOn = true;
  const result = await e.api.callStoryModel(state, 'test', [{ role: 'system', content: '测试' }, { role: 'user', content: '行动' }], {});
  assert.equal(result.text, '最终正文'); assert.equal(e.requests.length, 2); const request = JSON.stringify(e.requests[1]); assert.ok(request.includes('预算')); assert.ok((request.match(/t3/g) || []).length >= 2); e.cleanup();
});
test('新轮次记录并可回退出场与全部引擎游标', async () => {
  const e = await createHarness({ stream: (options) => textStream((options.tools || []).some((tool) => tool.name === e.api.SETTLE_TOOL.name) ? JSON.stringify({ summary: '本轮小结', diffs: [] }) : '测试角色出现。') }); const state = stateOf(e); state.config.settle = { provider: 'test', model: 'test-model' }; state.npcs = [{ 姓名: '测试角色', 最近出场: 0 }];
  const entry = await e.api.runTurn(state, '行动', '行动', { gameId: 'test' }); assert.equal(state.npcs[0].最近出场, 1); assert.ok(entry.diffs.some((d) => d.path[0] === '_收支结算月')); assert.ok(entry.diffs.some((d) => d.path[0] === 'npcs' && d.path[2] === '最近出场'));
  await e.api.truncateFrom(state, 1); assert.equal(state.npcs[0].最近出场, 0); assert.equal(state._收支结算月, undefined); e.cleanup();
});
test('旧轮次回退月结后，重新跨同月仍能结算', async () => {
  const e = await createHarness(); const state = stateOf(e); state.protagonist.金钱 = 100; state.protagonist.收支 = { 月收入: 1000, 月支出: 100 }; state._收支结算月 = 2020 * 12 + 1; state.world.当前日期时间 = '2020年2月1日 09:00';
  state.transcript.push({ seq: 1, role: 'assistant', body: '跨月', diffs: [{ path: ['world', '当前日期时间'], _had: true, _prev: '2020年1月31日 09:00', to: state.world.当前日期时间 }] });
  await e.api.truncateFrom(state, 1); state.world.当前日期时间 = '2020年2月1日 09:00'; const result = e.api.settleMonthly(state); assert.equal(result.delta, 900); e.cleanup();
});
test('空手机与助手槽位沿用主模型，微博单独配置也不判空', async () => {
  const e = await createHarness(); const state = stateOf(e); for (const slot of ['phone', 'assistant']) assert.equal(await e.api.callSlot(state, slot, [{ role: 'user', content: '测试' }]), '测试正文。'); assert.equal(e.api.configIsBlank({ weibo: { provider: 'test', model: 'test-model' } }), false); e.cleanup();
});
test('重生成停止不覆盖已有正文，运行标记会清除', async () => {
  const e = await createHarness({ maxTimerMs: 1000, stream: (options) => ({ [Symbol.asyncIterator]() { return { next: () => new Promise((resolve) => options.signal.addEventListener('abort', () => resolve({ done: true }), { once: true })), return: async () => ({ done: true }) }; } }) });
  const state = stateOf(e); state.story.current_message_index = 2; state.transcript.push({ seq: 1, role: 'user', body: '原行动' }, { seq: 1, role: 'assistant', body: '原正文', diffs: [] }); e.seed('test', state);
  const pending = e.call('regenFrom', { gameId: 'test', seq: 1 }); const settled = pending.then((value) => ({ value }), (error) => ({ error }));
  for (let i = 0; i < 100 && !e.requests.length; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(e.requests.length); await e.call('stopGenerate', { gameId: 'test' }); const result = await settled; assert.match(String(result.error && result.error.message), /已停止生成/); assert.equal(e.getState('test').transcript.at(-1).body, '原正文'); assert.equal(e.api.RUNNING.has('test'), false); e.cleanup();
});
test('导入分片重复重传幂等，乱序会报错', async () => {
  const e = await createHarness(); const state = stateOf(e); e.seed('test', state); await e.call('importBegin', { gameId: 'test' });
  await e.call('importChunk', { gameId: 'test', index: 0, data: '{' }); const repeated = await e.call('importChunk', { gameId: 'test', index: 0, data: '{' }); assert.equal(repeated.got, 1); await assert.rejects(e.call('importChunk', { gameId: 'test', index: 3, data: '}' }), /顺序/); e.cleanup();
});
