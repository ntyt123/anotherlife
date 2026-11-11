import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { loadClient } from './client-harness.mjs';
import { normalizeSettlementUpdate } from '../lib/settlement-compat.mjs';

const START = '南通中学', BEFORE = '北京校园', NOW = '京承高速返京车内';
const clone = value => JSON.parse(JSON.stringify(value));
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : node && node.type !== 'style' ? words(node.kids || []) : '';
const walk = (node, out = []) => { if (Array.isArray(node)) node.forEach(child => walk(child, out)); else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); } return out; };
const status = tree => walk(tree).find(node => node.props?.className === 'sim-status');
const toolReply = (name, args) => (async function* () { yield { type: 'tool-call-delta', id: name, index: 0, name, argumentsDelta: JSON.stringify(args) }; yield { type: 'finish', reason: { kind: 'tool-calls' } }; })();
async function rig({ update = { world: { 当前地点: NOW } }, legacy = false, toolMode = true, body = '车子已经离开片场，正行驶在返京的高速上。' } = {}) {
  const e = await createHarness({ stream: request => {
    const names = (request.tools || []).map(tool => tool.name);
    if (names.includes('emit_state_update')) return toolReply('emit_state_update', typeof update === 'function' ? update(request) : update);
    if (names.includes('game')) return toolReply('game', { game_content: body, think: '', summary: '车子正在返京。', options: [] });
    if (String(request.system || '').includes('【输出格式】')) return (async function* () { yield { type: 'text-delta', index: 0, text: body }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
    return (async function* () { yield { type: 'text-delta', index: 0, text: JSON.stringify({ chars: [], profiles: [] }) }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
  } });
  const s = e.api.defaultState(); s.gameId = 'test'; s.phase = 'play'; s.simulation = { enabled: false }; s.protagonist.姓名 = '样本主角'; s.npcs = [];
  Object.assign(s.world, { 起始地点: START, 当前地点: BEFORE, 当前日期时间: '2026年11月1日 10:00' });
  if (legacy) delete s.world.当前地点;
  Object.assign(s.config, { toolMode, settle: { provider: 'test', model: 'test-model' }, retrieve: { model: '' } });
  s.story.current_message_index = 1; s.story.dataCompletion = { wardrobes: { [JSON.stringify(['protagonist', '样本主角'])]: true }, attempted: {} };
  s.transcript = [{ seq: 0, role: 'assistant', body: '普通开局。', summary: '', diffs: [], issues: [], options: [] }];
  e.seed('test', s); return e;
}
const run = e => e.call('generateStory', { gameId: 'test', input: '继续这段路程。' });

test('默认世界有独立当前地点，不替换起始地点', async () => {
  const e = await createHarness(); try { const world = e.api.defaultState().world; assert.equal(world.当前地点, ''); assert.equal(world.起始地点, ''); } finally { e.cleanup(); }
});

test('顶部优先当前地点，旧档缺字段仍兼容旧地点', async () => {
  const e = await rig(); try {
    const calls = [], client = loadClient(async (...args) => { calls.push(args); });
    const s = e.getState('test'); s.world.当前地点 = NOW;
    let view = client.render('test'); view.functions.initLoaded(s); view = client.render('test');
    assert.match(words(status(view.tree)), new RegExp(NOW)); assert.doesNotMatch(words(status(view.tree)), new RegExp(START));
    const old = clone(s); delete old.world.当前地点; view.functions.commit(old); view = client.render('test');
    assert.match(words(status(view.tree)), new RegExp(START)); assert.equal(calls.length, 0);
  } finally { e.cleanup(); }
});

test('结算后的顶部读取新state，不被初始化draft的地点卡住，世界页也一致', async () => {
  const e = await rig(); try {
    const client = loadClient(); let view = client.render('test'); view.functions.initLoaded(e.getState('test')); view = client.render('test');
    const updated = await run(e); view.functions.commit(updated); view = client.render('test');
    assert.match(words(status(view.tree)), new RegExp(NOW)); assert.doesNotMatch(words(status(view.tree)), new RegExp(START));
    const worldButton = walk(view.tree).find(node => node.type === 'button' && typeof node.props?.onClick === 'function' && /世界$/u.test(words(node)) && words(node).length < 10);
    assert.ok(worldButton); worldButton.props.onClick(); view = client.render('test');
    const hero = walk(view.tree).find(node => node.props?.className === 'sim-when');
    assert.ok(hero); assert.match(words(hero), new RegExp(NOW));
  } finally { e.cleanup(); }
});

const formats = [
  ['规范world字段', location => ({ world: { 当前地点: location } })],
  ['world英文蛇形键', location => ({ world: { current_location: location } })],
  ['world英文驼峰键', location => ({ world: { currentLocation: location } })],
  ['中文世界容器和当前位置别名', location => ({ 世界: { 当前位置: location } })],
  ['顶层当前地点', location => ({ 当前地点: location })],
  ['顶层英文别名', location => ({ current_location: location })],
  ['顶层当前位置别名', location => ({ 当前位置: location })],
  ['other中文根与英文叶路径', location => ({ other: [{ path: ['世界', 'current_location'], value: location }] })],
  ['diffs指针路径', location => ({ diffs: [{ path: '/world/current_location', to: location }] })],
];
for (const [label, make] of formats) test(`旧档实际结算接受${label}，保留起始地点并走差分`, async () => {
  const e = await rig({ update: make(NOW), legacy: true }); try {
    const result = await run(e); assert.equal(result.world.当前地点, NOW); assert.equal(result.world.起始地点, START);
    assert.equal(result.world.current_location, undefined); assert.equal(result.world.currentLocation, undefined); assert.equal(result.world.当前位置, undefined);
    assert.ok(result.transcript.at(-1).diffs.some(diff => JSON.stringify(diff.path) === '["world","当前地点"]' && diff.to === NOW));
  } finally { e.cleanup(); }
});

test('当前位置进入真实正文与结算提示，交稿schema也明确区分开局地点', async () => {
  const e = await rig(); try {
    await run(e);
    const story = e.requests.find(request => (request.tools || []).some(tool => tool.name === 'game'));
    const settlement = e.requests.find(request => (request.tools || []).some(tool => tool.name === 'emit_state_update'));
    assert.match(String(story.system), /world\.当前地点/); assert.match(String(story.system), /起始地点只记录开局/);
    assert.match(String(settlement.system), /world\.当前地点/); assert.match(String(settlement.system), /结尾场景/);
    const schema = settlement.tools.find(tool => tool.name === 'emit_state_update').parameters.properties.world;
    assert.equal(schema.properties.当前地点.type, 'string'); assert.match(schema.properties.当前地点.description, /结束/);
    assert.equal(schema.additionalProperties, true);
  } finally { e.cleanup(); }
});

test('只有计划目的地或结算未交地点时，程序不靠正文关键词猜迁移', async () => {
  const e = await rig({ update: { world: { 当前日期时间: '2026年11月1日 10:05' } }, body: '他仍坐在北京校园里，计划下周去上海，再去杭州。' }); try {
    const result = await run(e); assert.equal(result.world.当前地点, BEFORE); assert.equal(result.world.起始地点, START);
  } finally { e.cleanup(); }
});

test('当前地点走原有删轮回退，起始地点与正文不被额外改写', async () => {
  const e = await rig(); try {
    const result = await run(e); assert.equal(result.world.当前地点, NOW);
    const s = e.getState('test'); await e.api.truncateFrom(s, 1);
    assert.equal(s.world.当前地点, BEFORE); assert.equal(s.world.起始地点, START); assert.equal(s.transcript.at(-1).seq, 0);
  } finally { e.cleanup(); }
});

test('旧格式直接改起始地点不被偷偷改名或覆盖独立当前地点', async () => {
  const e = await rig({ update: { world: { 起始地点: '更正后的开局场所' } } }); try {
    const result = await run(e); assert.equal(result.world.起始地点, '更正后的开局场所'); assert.equal(result.world.当前地点, BEFORE);
  } finally { e.cleanup(); }
});

test('同交冲突中英当前位置保留两份提交，不静默选一个', () => {
  const state = { world: { 起始地点: START }, protagonist: {} };
  const out = normalizeSettlementUpdate(state, { world: { 当前地点: '甲地', current_location: '乙地' } }, []);
  assert.equal(out.update.world.current_location, undefined); assert.equal(out.update.world.当前地点, undefined);
  assert.deepEqual(out.update.other.map(row => row.value), ['甲地', '乙地']);
});

test('人物与世界同名顶层地点仍保留归属歧义诊断，不擅自覆盖', () => {
  const diagnostics = [], state = { world: { 当前地点: '世界场所' }, protagonist: { 当前地点: '人物场所' } };
  const out = normalizeSettlementUpdate(state, { 当前地点: '不明归属' }, diagnostics);
  assert.equal(out.update.world, undefined); assert.equal(out.update.protagonist, undefined);
  assert.match(JSON.stringify(diagnostics), /无法确定归属/);
});


test('普通正文通道同样按结算更新地点，不强迫启用正文工具', async () => {
  const e = await rig({ toolMode: false, legacy: true }); try {
    const result = await run(e); assert.equal(result.world.当前地点, NOW); assert.equal(result.world.起始地点, START);
    const story = e.requests.find(request => String(request.system || '').includes('【输出格式】'));
    assert.ok(story); assert.equal((story.tools || []).length, 0);
    assert.match(result.transcript.at(-1).body, /车子已经离开片场/);
  } finally { e.cleanup(); }
});
