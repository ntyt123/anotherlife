import test from 'node:test';
import assert from 'node:assert/strict';
import { intimacyAdult, intimacyEnabled, intimacyPayload, applyIntimacyEvents, intimacySummary, intimacyContext, intimacySettlementTool } from '../lib/intimacy-core.mjs';
const clone = x => JSON.parse(JSON.stringify(x));
const state = () => ({ gameId: 'test', world: { 当前日期时间: '2026年11月1日 10:00', 当前地点: '住所' }, protagonist: { 姓名: '成年主角', 年龄: 25, 经验: '既有概述' }, npcs: [{ 姓名: '成年对象甲', 年龄: 24, actorId: 'actor:a' }, { 姓名: '成年对象乙', 年龄: 26, actorId: 'actor:b' }] });
const act = (type = '性交', count = 1, countKnown = true) => ({ type, count, countKnown });
const event = (eventId = 'new_1', partners = [{ partner: 'actor:a', acts: [act()] }]) => ({ eventId, mode: 'record', partners });
const apply = (s, payload, seq = 1) => applyIntimacyEvents(s, payload, { seq, textVersion: 'v' + seq });

test('成年判断：未知、未成年、生日矛盾、事件时未成年均不启用', () => {
  assert.equal(intimacyAdult({}, '2026年11月1日'), false);
  assert.equal(intimacyAdult({ 年龄: 17 }, '2026年11月1日'), false);
  assert.equal(intimacyAdult({ 年龄: 17, 生日: '1990年1月1日' }, '2026年11月1日'), false);
  assert.equal(intimacyAdult({ 年龄: 25, 生日: '2001年11月2日' }, '2018年11月1日', '2026年11月1日'), false);
  assert.equal(intimacyAdult({ 生日: '2008年11月1日' }, '2026年11月1日'), true);
  assert.equal(intimacyAdult({ 年龄: 25 }, '2000年1月1日', '2026年11月1日'), false);
});
test('不从旧概述初始化历史，空结果仅开始新账本', () => {
  const s = state(); const r = apply(s, []); assert.equal(r.accepted, true);
  assert.equal(intimacySummary(s).sessions, 0); assert.equal(s.protagonist.经验, '既有概述'); assert.equal(s.protagonist.intimacyHistory.sinceSeq, 1);
});
test('一场多行为分别计数，不把行为数当场次', () => {
  const s = state(); apply(s, [event('new_1', [{ partner: 'actor:a', acts: [act('性交', 2), act('口交', 1)] }])]);
  const summary = intimacySummary(s); assert.equal(summary.sessions, 1); assert.equal(summary.partners[0].sessions, 1); assert.deepEqual(summary.partners[0].acts, { 口交: 1, 性交: 2 });
});
test('多对象同场总计一场，行为不分给未参与对象', () => {
  const s = state(); apply(s, [event('new_1', [{ partner: 'actor:a', acts: [act()] }, { partner: 'actor:b', acts: [act('手部性接触')] }])]);
  const x = intimacySummary(s); assert.equal(x.sessions, 1); assert.equal(x.partnerCount, 2); assert.equal(x.partners.reduce((n, p) => n + p.sessions, 0), 2); assert.equal(x.partners[1].acts.性交, undefined);
});
test('两次独立事件即使类型一致也保留两场', () => { const s = state(); apply(s, [event('new_1'), event('new_2')]); assert.equal(intimacySummary(s).sessions, 2); });
test('同一来源重复提交或重跑不累加', () => { const s = state(); apply(s, [event(), event()]); apply(s, [event()]); assert.equal(intimacySummary(s).sessions, 1); assert.equal(intimacySummary(s).partners[0].acts.性交, 1); });
test('续接引用旧事件，更新绝对次数，遗漏的其他类型保留', () => {
  const s = state(); apply(s, [{ ...event('new_1', [{ partner: 'actor:a', acts: [act('性交'), act('口交')] }]), open: true }]);
  const id = s.protagonist.intimacyHistory.events[0].id;
  apply(s, [{ eventId: id, mode: 'continue', partners: [{ partner: 'actor:a', acts: [act('性交', 2)] }] }], 2);
  const x = intimacySummary(s); assert.equal(x.sessions, 1); assert.equal(x.partners[0].acts.性交, 2); assert.equal(x.partners[0].acts.口交, 1);
});
test('不明续接编号不当新事件，整批不半写', () => { const s = state(), before = clone(s); const r = apply(s, [event(), { ...event('missing'), mode: 'continue' }]); assert.equal(r.accepted, false); assert.deepEqual(s, before); });
test('同名对象歧义不猜，显式actorId可识别', () => { const s = state(); s.npcs[1].姓名 = s.npcs[0].姓名; assert.equal(apply(s, [event('new_1', [{ partner: s.npcs[0].姓名, acts: [act()] }])]).accepted, false); assert.equal(apply(s, [event()]).accepted, true); });
test('未知对象不新增角色', () => { const s = state(), before = clone(s); assert.equal(apply(s, [event('new_1', [{ partner: '不存在的人', acts: [act()] }])]).accepted, false); assert.deepEqual(s, before); });
test('任一对象未成年或年龄未知时该批原子保留，不落部分性记录', () => {
  for (const age of [0, 17]) { const s = state(); s.npcs[1].年龄 = age; const before = clone(s); assert.equal(apply(s, [event(), event('new_2', [{ partner: 'actor:b', acts: [act()] }])]).accepted, false); assert.deepEqual(s, before); }
});
test('事件时未成年即使目前成年也不登记', () => { const s = state(); s.npcs[0].生日 = '2002年1月1日'; assert.equal(apply(s, [{ ...event(), time: '2018年1月1日' }]).accepted, false); });
test('主角未成年或未知时没有账本、没有成人结算schema', () => {
  for (const age of [0, 17]) { const s = state(); s.protagonist.年龄 = age; assert.equal(intimacyEnabled(s), false); assert.equal(apply(s, [event()]).diffs.length, 0); assert.equal(s.protagonist.intimacyHistory, undefined); assert.equal(intimacyContext(s), ''); const t = intimacySettlementTool({ parameters: { properties: {}, required: [] } }, s); assert.equal(t.parameters.properties.intimacyEvents, undefined); }
});
test('次数未知记录事件但不猜精确数', () => { const s = state(); apply(s, [event('new_1', [{ partner: 'actor:a', acts: [act('性交', 0, false)] }])]); const x = intimacySummary(s); assert.equal(x.sessions, 1); assert.deepEqual(x.partners[0].acts, {}); assert.equal(x.partners[0].unknownActs, 1); });
test('非法次数、空对象、危险类型不能写入', () => {
  for (const bad of [act('性交', -1), act('性交', 1.5), act('__proto__'), act('含\n换行')]) { const s = state(); assert.equal(apply(s, [event('new_1', [{ partner: 'actor:a', acts: [bad] }])]).accepted, false); }
  assert.equal(apply(state(), [event('new_1', [{ partner: '', acts: [act()] }])]).accepted, false);
});
test('改名不拆档，删角色保留历史对象名', () => {
  const s = state(); apply(s, [event()]); s.npcs[0].姓名 = '新姓名'; assert.equal(intimacySummary(s).partners[0].name, '新姓名');
  apply(s, [event('new_2')], 2); assert.equal(intimacySummary(s).partnerCount, 1);
  s.npcs = []; assert.equal(intimacySummary(s).sessions, 2); assert.equal(intimacySummary(s).partners[0].name, '新姓名');
});
test('旧人物无actorId也有稳定账本引用，不改NPC；之后登记ID和别名能接回', () => {
  const s = state(); delete s.npcs[0].actorId; const original = clone(s.npcs);
  apply(s, [event('new_1', [{ partner: '成年对象甲', acts: [act()] }])]); assert.deepEqual(s.npcs, original);
  s.npcs[0].actorId = 'actor:later'; s.npcs[0].曾用名 = ['成年对象甲']; s.npcs[0].姓名 = '后来姓名';
  apply(s, [event('new_2', [{ partner: 'actor:later', acts: [act()] }])], 2); assert.equal(intimacySummary(s).partnerCount, 1);
});
test('跨容器副本只采一次，冲突或坏格式显式保留', () => {
  const e = event(); const result = intimacyPayload([{ intimacyEvents: [e], other: [{ path: ['intimacyEvents'], value: [e] }] }]); assert.equal(result.payload.length, 1); assert.equal(result.issues.length, 0);
  assert.ok(intimacyPayload([{ intimacyEvents: {} }]).issues.length);
  assert.ok(intimacyPayload([{ intimacyEvents: [e, { ...e, open: true }] }]).issues.length);
  assert.equal(intimacyPayload([{}]).provided, false);
});
test('缺结果不清账，模型原始输入不变', () => { const s = state(); const input = [event()], before = clone(input); apply(s, input); const old = clone(s.protagonist.intimacyHistory); assert.equal(apply(s, undefined).accepted, false); assert.deepEqual(s.protagonist.intimacyHistory, old); assert.deepEqual(input, before); });
test('差分带原值且追加不是整本复制；可逐项反向还原', () => {
  const s = state(); const first = apply(s, [event()]); const old = clone(s.protagonist.intimacyHistory);
  const second = apply(s, [event('new_2')], 2); assert.ok(second.diffs.length); assert.ok(second.diffs.every(d => d.by === 'intimacy' && d.path.length > 2));
  assert.equal(first.diffs[0]._had, false); assert.deepEqual(second.diffs[0].path.slice(0, 2), ['protagonist', 'intimacyHistory']);
  for (const d of [...second.diffs].reverse()) { let box = s; for (const p of d.path.slice(0, -1)) box = box[p]; const k = d.path.at(-1); if (d._had) box[k] = clone(d._prev); else if (Array.isArray(box)) box.splice(k, 1); else delete box[k]; }
  assert.deepEqual(s.protagonist.intimacyHistory, old);
});
test('上下文只带有限相关对象及近期事件，不复制全部账本', () => {
  const s = state(); for (let i = 0; i < 30; i++) apply(s, [event('new_' + i)], i + 1);
  const context = intimacyContext(s); assert.ok(context.includes('只读摘要')); const parsed = JSON.parse(context.split('\n').at(-1)); assert.ok(parsed.recentEvents.length <= 8); assert.equal(parsed.sessions, 30);
});


test('续接更新最近游戏时间，首次时间保持不动',()=>{const s=state();apply(s,[event()]);const first=s.protagonist.intimacyHistory.events[0];s.world.当前日期时间='2026年11月1日 11:00';apply(s,[{...event(first.id),mode:'continue'}],2);const x=intimacySummary(s);assert.equal(x.partners[0].first,'2026年11月1日 10:00');assert.equal(x.last,'2026年11月1日 11:00');});
test('已桥接旧身份不会与同名新actorId合并',()=>{const s=state();delete s.npcs[0].actorId;apply(s,[event('new_1',[{partner:'成年对象甲',acts:[act()]}])]);s.npcs[0].actorId='actor:original';apply(s,[event('new_2',[{partner:'actor:original',acts:[act()]}])],2);s.npcs[0].actorId='actor:new';apply(s,[event('new_3',[{partner:'actor:new',acts:[act()]}])],3);assert.equal(intimacySummary(s).partnerCount,2);});
test('同一事件字段顺序不同的镜像不误报冲突',()=>{const e=event(),other={partners:e.partners,mode:e.mode,eventId:e.eventId};const out=intimacyPayload([{intimacyEvents:[e],other:[{path:['intimacyEvents'],value:[other]}]}]);assert.equal(out.issues.length,0);assert.equal(out.payload.length,1);});
test('JSON数组字符串路径也能提取专用事件',()=>{const out=intimacyPayload([{other:[{path:'["intimacyEvents"]',value:[event()]}]}]);assert.equal(out.provided,true);assert.equal(out.payload.length,1);});


test('年龄带岁字也识别，非规范或未成年年龄不能借生日矛盾绕过',()=>{assert.equal(intimacyAdult({年龄:'17岁',生日:'1990年1月1日'},'2026年11月1日'),false);assert.equal(intimacyAdult({年龄:'未成年',生日:'1990年1月1日'},'2026年11月1日'),false);assert.equal(intimacyAdult({年龄:'25周岁'},'2026年11月1日'),true);});
