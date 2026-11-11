import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntimacyPanel } from '../lib/intimacy-client.js';
import { intimacyEnabled, intimacySummary, applyIntimacyEvents } from '../lib/intimacy-core.mjs';
import { createHarness } from './harness.mjs';
import { loadClient } from './client-harness.mjs';
const React = { createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }) };
const Panel = createIntimacyPanel(React, { intimacyEnabled, intimacySummary });
const walk = (node, out = []) => { if (Array.isArray(node)) node.forEach(x => walk(x, out)); else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); } return out; };
const words = node => ['string', 'number'].includes(typeof node) ? String(node) : Array.isArray(node) ? node.map(words).join('') : node && node.type !== 'style' ? words(node.kids || []) : '';
const sample = () => ({ gameId: 'test', phase: 'play', world: { 当前日期时间: '2026年11月11日 12:00', 当前地点: '住所' }, protagonist: { 年龄: 25, 经验: '保留原概述' }, npcs: [{ 姓名: '成年对象甲', 年龄: 24, actorId: 'actor:a' }] });
const add = s => applyIntimacyEvents(s, [{ eventId: 'new_1', partners: [{ partner: 'actor:a', acts: [{ type: '性交', count: 2, countKnown: true }, { type: '口交', count: 0, countKnown: false }] }] }], { seq: 6, textVersion: 'v6' });
test('空模块说明是已记录，不冒称没有经历，不读取旧概述造数字', () => { const s = sample(), tree = Panel({ state: s }); assert.doesNotMatch(words(tree), /已记录对象|累计/); assert.match(words(tree), /还没有记录/); assert.equal(s.protagonist.intimacyHistory, undefined); });
test('最近对象默认展开，类型次数时间地点齐全且无来源轮次', () => { const s = sample(); add(s); const tree = Panel({ state: s }), nodes = walk(tree); assert.match(words(tree), /共1次/); assert.match(words(tree), /性交 2次/); assert.match(words(tree), /次数未明确/); assert.doesNotMatch(words(tree), /来源|第6轮/); assert.match(words(tree), /住所/); const detail = nodes.find(n => n.type === 'details'); assert.ok(detail); assert.equal(detail.props.open, true); assert.ok(nodes.find(n => n.type === 'summary')); });
test('未成年、年龄未知和创角阶段不展示新模块', () => { for (const age of [0, 17]) { const s = sample(); s.protagonist.年龄 = age; assert.equal(Panel({ state: s }), null); } const s = sample(); s.phase = 'character'; assert.equal(Panel({ state: s }), null); });
test('展示只读，不含编辑按钮和RPC回调，不改变状态', () => { const s = sample(); add(s); const before = JSON.stringify(s), tree = Panel({ state: s }); assert.equal(JSON.stringify(s), before); assert.equal(walk(tree).some(n => n.type === 'button' || n.props.onClick), false); });
test('改名后展示新名，删档后仍有记录；HTML按文本展示', () => { const s = sample(); add(s); s.npcs[0].姓名 = '<b>新名字</b>'; let tree = Panel({ state: s }); assert.match(words(tree), /<b>新名字<\/b>/); assert.equal(walk(tree).some(n => n.props.dangerouslySetInnerHTML), false); s.npcs = []; tree = Panel({ state: s }); assert.match(words(tree), /成年对象甲/); });
test('真实嵌入App主角页只有一个账本模块，概述保留，不改正文或调用模型', async () => {
  const e = await createHarness(); try {
    const s = Object.assign(e.api.defaultState(), sample()); s.protagonist = { ...e.api.defaultState().protagonist, ...s.protagonist, 姓名: '成年主角' }; add(s);
    const calls = [], client = loadClient(async (...args) => { calls.push(args); }); let view = client.render('test'); view.functions.initLoaded(s); view = client.render('test');
    const button = walk(view.tree).find(n => n.type === 'button' && typeof n.props?.onClick === 'function' && /主角$/u.test(words(n)) && words(n).length < 10); assert.ok(button); button.props.onClick(); view = client.render('test');
    const modules = walk(view.tree).filter(n => n.props?.className === 'sim-intimacy-panel'); assert.equal(modules.length, 1); assert.match(words(modules[0]), /成年对象甲/); assert.match(words(view.tree), /保留原概述/); assert.equal(calls.length, 0);
    const changed = JSON.parse(JSON.stringify(s)); changed.protagonist.intimacyHistory.events[0].partners[0].acts.find(act => act.type === '性交').count = 4; view.functions.commit(changed); view = client.render('test'); assert.match(words(walk(view.tree).find(n => n.props?.className === 'sim-intimacy-panel')), /性交 4次/);
  } finally { e.cleanup(); }
});
