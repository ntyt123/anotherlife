import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntimacyPanel } from '../lib/intimacy-client.js';
import { intimacyEnabled, intimacySummary, applyIntimacyEvents } from '../lib/intimacy-core.mjs';
import { createHarness } from './harness.mjs';
import { loadClient } from './client-harness.mjs';
const React = { createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }) };
const walk = (node, out = []) => { if (Array.isArray(node)) node.forEach(n => walk(n, out)); else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); } return out; };
const words = node => ['string','number'].includes(typeof node) ? String(node) : Array.isArray(node) ? node.map(words).join('') : node && node.type !== 'style' ? words(node.kids || []) : '';
const find = (tree, cls) => walk(tree).find(n => n.props?.className === cls);
const sample = (count = 1) => {
  const s = { gameId: 'game-a', phase: 'play', world: { 当前日期时间: '2026年11月11日 12:00', 当前地点: '北京 · 住所' }, protagonist: { 姓名: '成年主角', 年龄: 25 }, npcs: [{ 姓名: '成年对象甲', 年龄: 24, actorId: 'actor:a' }] };
  for (let i = 0; i < count; i++) applyIntimacyEvents(s, [{ eventId: 'new_' + i, partners: [{ partner: 'actor:a', acts: [{ type: '性交', count: 1, countKnown: true }] }] }], { seq: 50 + i, textVersion: 'v' + i });
  return s;
};
const panel = () => createIntimacyPanel(React, { intimacyEnabled, intimacySummary });
const toggle = (node, open) => { assert.equal(typeof node?.props?.onToggle, 'function'); const target = { open }; node.props.onToggle({ currentTarget: target, target }); };

test('性经历整区可折叠，对象卡也可折叠，最近对象默认展开', () => {
  const tree = panel()({ state: sample() }); assert.equal(tree.type, 'details'); assert.equal(tree.props.open, true);
  const card = find(tree, 'sim-intimacy-card'); assert.equal(card.type, 'details'); assert.equal(card.props.open, true); assert.match(words(tree), /性经历/);
});
test('每个对象下面直接用时间地点行为三列表格呈现', () => {
  const tree = panel()({ state: sample() }), table = find(tree, 'sim-intimacy-table'); assert.ok(table);
  const headers = walk(table).filter(n => n.type === 'th').map(words); assert.deepEqual(headers, ['时间','地点','性行为']);
  assert.match(words(table), /2026年11月11日/); assert.match(words(table), /北京 · 住所/); assert.match(words(table), /性交.*1次/); assert.match(words(find(tree, 'sim-intimacy-card')), /共1次/);
});
test('界面不显示轮次来源起点或总览，只保留人物经历事实', () => {
  const text = words(panel()({ state: sample() })); assert.doesNotMatch(text, /第\s*\d+\s*轮|来源|记录起于|已记录对象|累计|textVersion|eventId/);
});
test('每个对象先显示最近3条，更多历史默认收起但不丢数据', () => {
  const s = sample(7), before = JSON.stringify(s), tree = panel()({ state: s }), table = find(tree, 'sim-intimacy-table'), older = find(tree, 'sim-intimacy-older');
  assert.equal(walk(table).filter(n => n.type === 'tbody').flatMap(n => walk(n).filter(x => x.type === 'tr')).length, 3);
  assert.equal(older.type, 'details'); assert.equal(older.props.open, false); assert.match(words(older), /更早经历/); assert.equal(s.protagonist.intimacyHistory.events.length, 7); assert.equal(JSON.stringify(s), before);
});
test('手动折叠按存档和对象隔离，数据重渲染不反弹', () => {
  const render = panel(), s = sample(5); let tree = render({ state: s }); toggle(tree, false); toggle(find(tree, 'sim-intimacy-card'), false); toggle(find(tree, 'sim-intimacy-older'), true);
  tree = render({ state: s }); assert.equal(tree.props.open, false); assert.equal(find(tree, 'sim-intimacy-card').props.open, false); assert.equal(find(tree, 'sim-intimacy-older').props.open, true);
  const other = { ...s, gameId: 'game-b' }; tree = render({ state: other }); assert.equal(tree.props.open, true); assert.equal(find(tree, 'sim-intimacy-card').props.open, true); assert.equal(find(tree, 'sim-intimacy-older').props.open, false);
});
test('多个对象默认只展开最近对象，姓名与次数仍可见', () => {
  const s = sample(); s.npcs.push({ 姓名: '成年对象乙', 年龄: 26, actorId: 'actor:b' }); applyIntimacyEvents(s, [{ eventId: 'new_b', partners: [{ partner: 'actor:b', acts: [{ type: '口交', count: 1, countKnown: true }] }] }], { seq: 60, textVersion: 'v60' });
  const cards = walk(panel()({ state: s })).filter(n => n.props?.className === 'sim-intimacy-card'); assert.equal(cards.length, 2); assert.equal(cards[0].props.open, true); assert.equal(cards[1].props.open, false); assert.match(words(cards[0].kids[0]), /成年对象乙.*共1次/);
});
async function roster() {
  const e = await createHarness(), calls = [], client = loadClient(async (...args) => { calls.push(args); });
  const s = e.api.defaultState(); s.gameId = 'test'; s.phase = 'play'; s.simulation = { enabled: false }; s.protagonist.年龄 = 25; s.story.current_message_index = 100;
  s.npcs = [{ 姓名: '最近角色', 性别: '男', 年龄: 25, 最近出场: 99 }, { 姓名: '重要角色', 性别: '男', 年龄: 25, 最近出场: 1, 重要: true }, { 姓名: '旧角色', 性别: '男', 年龄: 25, 最近出场: 1 }];
  let view = client.render('test'); view.functions.initLoaded(s); view = client.render('test');
  const nav = walk(view.tree).find(n => n.type === 'button' && typeof n.props?.onClick === 'function' && /角色$/u.test(words(n)) && words(n).length < 8); assert.ok(nav); nav.props.onClick();
  return { e, client, calls, s, view: client.render('test') };
}
test('实际App角色列表可整区折叠，重渲染保持且不发RPC', async () => {
  const { e, client, calls, s, view } = await roster(); try {
    const fold = find(view.tree, 'sim-card sim-roster-fold'); assert.ok(fold); assert.equal(fold.type, 'details'); assert.equal(fold.props.open, true); toggle(fold, false);
    const updated = JSON.parse(JSON.stringify(s)); updated.protagonist.金钱 = 1234; view.functions.commit(updated);
    const next = client.render('test'); assert.equal(find(next.tree, 'sim-card sim-roster-fold').props.open, false);
    const self = walk(next.tree).find(n=>n.type==='button'&&/主角$/u.test(words(n))&&words(n).length<8); self.props.onClick();
    const selfView=client.render('test'), back=walk(selfView.tree).find(n=>n.type==='button'&&/角色$/u.test(words(n))&&words(n).length<8); back.props.onClick();
    assert.equal(find(client.render('test').tree,'sim-card sim-roster-fold').props.open,false); assert.equal(calls.length, 0);
  } finally { e.cleanup(); }
});
test('角色重要置顶及档案分组保持，档案可独立折叠且不显示归档轮数', async () => {
  const { e, client, calls, view } = await roster(); try {
    const fold = find(view.tree, 'sim-card sim-roster-fold'); assert.ok(fold); const grids = walk(fold).filter(n => n.props?.className === 'sim-npc-grid'); assert.equal(grids.length, 2);
    const active = words(grids[0]); assert.ok(active.indexOf('重要角色') < active.indexOf('最近角色')); assert.doesNotMatch(active, /旧角色/);
    const archive = find(fold, 'sim-fact sim-roster-archive'); assert.ok(archive); assert.equal(archive.props.open, false); assert.match(words(archive), /旧角色/); assert.doesNotMatch(words(archive.kids[0]), /轮/);
    toggle(archive, true); assert.equal(find(client.render('test').tree, 'sim-fact sim-roster-archive').props.open, true); assert.equal(calls.length, 0);
  } finally { e.cleanup(); }
});


test('同一经历的起止时间不同则显示已有时间范围，不改数据',()=>{const s=sample();const item=s.protagonist.intimacyHistory.events[0];item.lastTime='2026年11月11日 13:00';const before=JSON.stringify(s);const text=words(panel()({state:s}));assert.match(text,/2026年11月11日 12:00 至 2026年11月11日 13:00/);assert.equal(JSON.stringify(s),before);});
