import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { createSimulation, updateSimulationSettings } from '../lib/generic-simulation.mjs';
const clone = x => JSON.parse(JSON.stringify(x));
const event = (id = 'new_1') => ({ eventId: id, mode: 'record', partners: [{ partner: 'actor:a', acts: [{ type: '性交', count: 1, countKnown: true }] }] });
const textReply = (value, kind = 'stop') => (async function* () { yield { type: 'text-delta', index: 0, text: typeof value === 'string' ? value : JSON.stringify(value) }; yield { type: 'finish', reason: { kind } }; })();
const toolReply = (name, value, kind = 'tool-calls') => (async function* () { yield { type: 'tool-call-delta', id: name, index: 0, name, argumentsDelta: JSON.stringify(value) }; yield { type: 'finish', reason: { kind } }; })();
async function rig({ simulation = false, toolMode = false, age = 25, partnerAge = 24, payload = { intimacyEvents: [event()] }, finish = 'stop', structured = false } = {}) {
  let current = payload, ending = finish;
  const e = await createHarness({ stream: request => {
    if (String(request.system).includes('后台变量结算器')) return structured ? toolReply('emit_state_update', { summary: '已发生事件结算。', ...current }, ending === 'stop' ? 'tool-calls' : ending) : textReply({ summary: '已发生事件结算。', ...current }, ending);
    if ((request.tools || []).some(tool => tool.name === 'game')) return toolReply('game', { game_content: '这一段成年关系中的事件已经结束。', think: '', summary: '', options: [] });
    return textReply('这一段成年关系中的事件已经结束。');
  } });
  const s = e.api.defaultState(); s.gameId = 'test'; s.phase = 'play'; s.config.toolMode = toolMode; s.config.scentByAI = false; s.config.settle = { provider: 'test', model: 'test' };
  Object.assign(s.protagonist, { 姓名: '成年主角', 性别: '男', 年龄: age, 是否艺人: false, 经验: '保留的文字概述', 金钱: 1000 });
  s.world.当前日期时间 = '2026年11月11日 12:00'; s.world.当前地点 = '住所';
  s.npcs = [{ actorId: 'actor:a', 姓名: '成年对象甲', 性别: '男', 年龄: partnerAge, 身份: '普通角色', 外貌: '日常外貌', 表性格: '直率', 里性格: '认真', 背景: '日常生活', 穿着: {} }];
  s.simulation = simulation ? updateSimulationSettings(createSimulation(), { settings: { worldNewsEnabled: false, managementEnabled: false, boundSystemEnabled: false } }) : { enabled: false };
  s.simulation.setupReady = true; s.story.current_message_index = 1; s.transcript = [{ seq: 0, role: 'assistant', body: '开局。', diffs: [], options: [], issues: [] }];
  e.seed('test', s);
  return { e, set: (value, kind = 'stop') => { current = value; ending = kind; } };
}
const generate = e => e.call('generateStory', { gameId: 'test', input: '继续当前场景。' });
const history = e => e.getState('test').protagonist.intimacyHistory;
for (const structured of [false, true]) test(`实际${structured ? '工具' : '普通JSON'}结算记账，正文通道不被改变`, async () => {
  const { e } = await rig({ structured, toolMode: structured }); try {
    const s = await generate(e); assert.equal(s.protagonist.intimacyHistory.events.length, 1); assert.equal(s.protagonist.经验, '保留的文字概述'); assert.equal(s.protagonist.金钱, 1000);
    const requests = e.requests.filter(request => String(request.system).includes('后台变量结算器')); assert.equal(requests.length, 1);
    assert.ok(requests[0].tools[0].parameters.properties.intimacyEvents); assert.ok(requests[0].tools[0].parameters.required.includes('intimacyEvents'));
    assert.ok(s.transcript.at(-1).diffs.some(d => d.by === 'intimacy'));
  } finally { e.cleanup(); }
});
for (const simulation of [false, true]) {
  test(`${simulation ? '资料重核' : '普通重算'}重复执行不叠加场次，保持正文和资金`, async () => {
    const { e } = await rig({ simulation }); try {
      const s = await generate(e), body = s.transcript.at(-1).body;
      await e.call('regenerateLatestVars', { gameId: 'test' }); await e.call('regenerateLatestVars', { gameId: 'test' });
      const after = e.getState('test'); assert.equal(history(e).events.length, 1); assert.equal(after.protagonist.金钱, 1000); assert.equal(after.transcript.at(-1).body, body);
      assert.equal(after.transcript.at(-1).diffs.filter(d => d.by === 'intimacy' && d.path.length === 2).length, 1);
    } finally { e.cleanup(); }
  });
  test(`${simulation ? '资料重核' : '普通重算'}缺失坏格式和截断都保留原账及可逆差分`, async () => {
    const { e, set } = await rig({ simulation }); try {
      await generate(e); const before = clone(history(e));
      for (const [payload, finish] of [[{}, 'stop'], [{ intimacyEvents: {} }, 'stop'], [{ intimacyEvents: [] }, 'length']]) {
        set(payload, finish); await e.call('regenerateLatestVars', { gameId: 'test' }); assert.deepEqual(history(e), before);
      }
      const s = e.getState('test'); await e.api.truncateFrom(s, 1); assert.equal(s.protagonist.intimacyHistory, undefined);
    } finally { e.cleanup(); }
  });
  test(`${simulation ? '资料重核' : '普通重算'}显式空仅撤销本轮贡献，早一轮记录保留`, async () => {
    const { e, set } = await rig({ simulation }); try {
      await generate(e); const firstId = history(e).events[0].id; await generate(e); assert.equal(history(e).events.length, 2);
      set({ intimacyEvents: [] }); await e.call('regenerateLatestVars', { gameId: 'test' }); assert.equal(history(e).events.length, 1); assert.equal(history(e).events[0].id, firstId);
    } finally { e.cleanup(); }
  });
}
test('跨轮续接更新同一场，删最新轮恢复上一轮行为数', async () => {
  const { e, set } = await rig(); try {
    await generate(e); const id = history(e).events[0].id;
    set({ intimacyEvents: [{ eventId: id, mode: 'continue', partners: [{ partner: 'actor:a', acts: [{ type: '性交', count: 2, countKnown: true }] }] }] });
    await generate(e); assert.equal(history(e).events.length, 1); assert.equal(history(e).events[0].partners[0].acts[0].count, 2);
    const s = e.getState('test'); await e.api.truncateFrom(s, 2); assert.equal(s.protagonist.intimacyHistory.events[0].partners[0].acts[0].count, 1);
  } finally { e.cleanup(); }
});
for (const path of [['intimacyEvents'], '/intimacyEvents']) test('包装事件只走专用账本、不存内部状态误报：' + JSON.stringify(path), async () => {
  const { e } = await rig({ payload: { other: [{ path, value: [event()] }] } }); try {
    const s = await generate(e); assert.equal(history(e).events.length, 1); assert.ok(!(s.transcript.at(-1).issues || []).some(i => /不允许修改内部状态|无法确定字段归属/.test(i.why) && /intimacyEvents/.test(JSON.stringify(i))));
  } finally { e.cleanup(); }
});
test('普通人物字段和other不能伪造覆盖账本，其他合法资料继续更新', async () => {
  const { e } = await rig({ payload: { intimacyEvents: [], protagonist: { intimacyHistory: { events: [{ id: 'forged' }] }, 当前状态: '正常' }, other: [{ path: ['protagonist', 'intimacyHistory'], value: { events: [{ id: 'forged2' }] } }] } }); try {
    const s = await generate(e); assert.equal(history(e).events.length, 0); assert.equal(s.protagonist.当前状态, '正常');
  } finally { e.cleanup(); }
});
test('未成年和年龄未知主角无成人schema、提示及账本', async () => {
  for (const age of [0, 17]) { const { e } = await rig({ age }); try {
    await generate(e); assert.equal(history(e), undefined); const request = e.requests.find(r => String(r.system).includes('后台变量结算器'));
    assert.equal(request.tools[0].parameters.properties.intimacyEvents, undefined); assert.ok(!String(request.system).includes('【性经验事件账本】'));
  } finally { e.cleanup(); } }
});
test('对象未成年或年龄未知不写记录，真实请求不为失败追加重试', async () => {
  for (const partnerAge of [0, 17]) { const { e } = await rig({ partnerAge }); try { await generate(e); assert.equal(history(e), undefined); assert.equal(e.requests.filter(r => String(r.system).includes('后台变量结算器')).length, 1); } finally { e.cleanup(); } }
});
test('账本不进入完整变量快照，结算只给摘要及近期引用', async () => {
  const { e, set } = await rig(); try { await generate(e); set({ intimacyEvents: [] }); await generate(e);
    const request = e.requests.filter(r => String(r.system).includes('后台变量结算器')).at(-1);
    assert.ok(String(request.system).includes('【性经验账本·只读摘要】')); assert.ok(!String(request.system).includes('"intimacyHistory"'));
  } finally { e.cleanup(); }
});


test('星途开启时截断由既有保护拒绝，账本仍完整保留', async () => {
  const {e,set}=await rig();try{const seed=e.getState('test');seed.protagonist.是否艺人=true;e.seed('test',seed);await generate(e);const before=clone(history(e));set({intimacyEvents:[]},'length');await assert.rejects(e.call('regenerateLatestVars',{gameId:'test'}),/未完成/);assert.deepEqual(history(e),before);}finally{e.cleanup();}
});

test('本轮把既有未成年对象改成成年也不能绕过事件成年核对', async () => {
  const {e}=await rig({partnerAge:17,payload:{chars:[{姓名:'成年对象甲',年龄:24}],intimacyEvents:[event()]}});try{await generate(e);assert.equal(history(e),undefined);}finally{e.cleanup();}
});
