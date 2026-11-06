import test from 'node:test';
import assert from 'node:assert/strict';
import { captureScentTextState, planScentTextSync, synchronizeScentText, parseScentTextSyncResult, scentTextLevel, isAdultTextSyncActor } from '../lib/scent-text-sync.mjs';
import { createHarness, clone } from './harness.mjs';
import { loadClient } from './client-harness.mjs';
const make = () => ({ config: { scentByAI: true }, world: { 当前日期时间: '2026年11月6日 12:00' }, protagonist: { 姓名: '主角', 性别: '男', 年龄: 30 }, npcs: [{ actorId: 'n:one', 姓名: '成年甲', 性别: '女', 年龄: 30, 穿着: Object.fromEntries(['内衣', '内裤', '袜子'].map(part => [part, { 物品: '棉质' + part, 材质: '棉', 气味: '旧的普通衣物记录。', 气味强度: 69, 穿着小时: 23 }])) }] });
const diff = (path, from, to, by) => ({ path, from: clone(from ?? null), to, by, _had: from !== undefined, _prev: clone(from ?? null) });
const options = (s, seq = 1) => ({ before: captureScentTextState(s), beforeEngine: captureScentTextState(s), body: '成年甲来取资料。', seq });
const good = messages => JSON.stringify({ items: JSON.parse(messages[1].content).items.map(t => ({ id: t.id, text: `衣料上的汗味浓重，已穿着${t.hours}小时。` })) });
async function sync(s, opts, response = good) { const calls = []; const result = await synchronizeScentText(s, opts, { engineDiff: diff, request: async messages => { calls.push(messages); return response(messages); } }); return { ...result, calls }; }

test('沿用旧文遇跨档时，合并一请求且输入为最终数值', async () => {
  const s = make(), opts = options(s); for (const slot of Object.values(s.npcs[0].穿着)) { slot.气味强度 = 81.6; slot.穿着小时 = 49.7; }
  const result = await sync(s, opts); assert.equal(result.calls.length, 1); assert.equal(result.changed, 3);
  const items = JSON.parse(result.calls[0][1].content).items; assert.ok(items.every(t => t.strength === 81.6 && t.hours === 49.7));
  assert.ok(result.diffs.every(d => ['气味', '_scentTextSync'].includes(d.path.at(-1)))); assert.ok(result.diffs.every(d => d.by === 'scent-text-sync'));
  for (const slot of Object.values(s.npcs[0].穿着)) { assert.equal(slot.气味强度, 81.6); assert.equal(slot.穿着小时, 49.7); assert.equal(slot._scentTextSync.source, 'sync-model'); assert.equal(slot._scentTextSync.strength, 81.6); }
});
test('新同步文案未跨强度和时长档，不重复付费调用；跨档后更新', async () => {
  const s = make(); await sync(s, options(s)); let opts = options(s, 2); for (const slot of Object.values(s.npcs[0].穿着)) { slot.气味强度 = 70; slot.穿着小时 = 23.1; }
  assert.equal((await sync(s, opts)).calls.length, 0);
  opts = options(s, 3); s.npcs[0].穿着.袜子.气味强度 = 70.1; const r = await sync(s, opts); assert.equal(r.changed, 1); assert.equal(r.calls.length, 1);
});
test('同名衣物换洗导致时长下降，即使同档也失效刷新', async () => {
  const s = make(); for (const x of Object.values(s.npcs[0].穿着)) { x.气味强度 = 5; x.穿着小时 = 0.9; } await sync(s, options(s));
  const opts = options(s, 2); s.npcs[0].穿着.袜子.穿着小时 = 0; const r = await sync(s, opts); assert.equal(r.changed, 1); assert.equal(s.npcs[0].穿着.袜子._scentTextSync.washSeq, 2);
});
test('主结算提交了符合最终档位的新文案时直接绑定，不再请求一次', async () => {
  const s = make(), opts = options(s); for (const x of Object.values(s.npcs[0].穿着)) x.气味 = '刚更新的普通衣物记录。'; opts.beforeEngine = captureScentTextState(s);
  const r = await sync(s, opts); assert.equal(r.calls.length, 0); assert.equal(r.changed, 3); assert.equal(s.npcs[0].穿着.袜子._scentTextSync.source, 'settlement-model');
});
test('主结算新文之后后台跨档，仍需按最终档位同步', async () => {
  const s = make(), opts = options(s); for (const x of Object.values(s.npcs[0].穿着)) x.气味 = '主结算新文。'; opts.beforeEngine = captureScentTextState(s); s.npcs[0].穿着.袜子.气味强度 = 95;
  const r = await sync(s, opts); assert.equal(r.calls.length, 1); assert.equal(JSON.parse(r.calls[0][1].content).items.length, 1); assert.equal(r.changed, 3);
});
test('旧存档缺依据首次出场同步；未出场角色不额外请求或写元数据', async () => {
  const s = make(), opts = { ...options(s), body: '主角独自整理文件。' }; const before = JSON.stringify(s); assert.equal((await sync(s, opts)).calls.length, 0); assert.equal(JSON.stringify(s), before);
  assert.equal((await sync(s, { ...opts, force: true })).changed, 3);
});
test('请求不含旧正文、人物名、年龄、剧情及其他角色数据', async () => {
  const s = make(); s.npcs[0].穿着.袜子.气味 = '旧文秘密标记'; s.npcs[0].隐私 = '不该外传';
  const r = await sync(s, options(s)); const payload = JSON.stringify(r.calls[0]); assert.doesNotMatch(payload, /旧文秘密标记|成年甲|不该外传|取资料/); assert.match(payload, /非色情/);
});
test('未成年、年龄未知、矛盾年龄、男性均不进入新同步请求', async () => {
  const variants = [{ 年龄: 17 }, { 年龄: '' }, { 年龄: 30, 生日: '2010-11-06' }, { 年龄: 17, 生日: '1990-01-01' }, { 性别: '男' }];
  for (const extra of variants) { const s = make(); Object.assign(s.npcs[0], extra); const before = JSON.stringify(s); const r = await sync(s, { ...options(s), force: true }); assert.equal(r.calls.length, 0); assert.equal(JSON.stringify(s), before); }
  assert.equal(isAdultTextSyncActor({ 性别: '女', 年龄: '18岁' }, ''), true);
});
test('不开AI或数值非法时不写、不请求、不偷偷改引擎模式', async () => {
  const s = make(); s.config.scentByAI = false; assert.equal((await sync(s, options(s))).calls.length, 0);
  s.config.scentByAI = true; for (const x of Object.values(s.npcs[0].穿着)) x.气味强度 = NaN; assert.equal((await sync(s, options(s))).calls.length, 0);
});
test('失败保留旧文和数值，下一轮不静默重试；显式按钮可重试', async () => {
  const s = make(), old = clone(s.npcs[0].穿着); const failed = await sync(s, options(s), () => { throw new Error('模型不可用'); }); assert.equal(failed.calls.length, 1); assert.equal(failed.issues.length, 1);
  for (const part of Object.keys(old)) { assert.equal(s.npcs[0].穿着[part].气味, old[part].气味); assert.equal(s.npcs[0].穿着[part].气味强度, old[part].气味强度); }
  const r = await sync(s, options(s, 2)); assert.equal(r.calls.length, 0); assert.equal((await sync(s, { ...options(s, 3), force: true })).changed, 3);
});
test('漏回或冲突只保留失败项，正确条目仍保存且不重试整批', async () => {
  const s = make(), r = await sync(s, options(s), messages => { const rows = JSON.parse(messages[1].content).items; return JSON.stringify({ items: [{ id: rows[0].id, text: '普通的新衣物记录。' }, { id: rows[1].id, text: '甲' }, { id: rows[1].id, text: '乙' }] }); });
  assert.equal(r.changed, 1); assert.equal(r.calls.length, 1); assert.equal(r.issues.length, 1); assert.equal(s.npcs[0].穿着.内裤.气味, '旧的普通衣物记录。');
});
test('停止中的回复不落任何同步结果或失败元数据', async () => {
  const s = make(), before = JSON.stringify(s); let stopped = false; const r = await synchronizeScentText(s, options(s), { engineDiff: diff, stopped: () => stopped, request: async messages => { stopped = true; return good(messages); } });
  assert.equal(r.stopped, true); assert.equal(r.diffs.length, 0); assert.equal(JSON.stringify(s), before);
});
test('解析兼容围栏、数组和中文字段，不接收数值或其他路径更改', () => {
  const r = parseScentTextSyncResult('```json\n[{"编号":"s0","气味":"中性记录","strength":999}]\n```'); assert.equal(r.get('s0'), '中性记录'); assert.equal(r.size, 1); assert.throws(() => parseScentTextSyncResult('模型未给结果'), /条目数组/);
  assert.deepEqual([0, 10, 30, 50, 70, 85, 100].map(scentTextLevel), [0, 0, 1, 2, 3, 4, 5]);
});
test('主结算伪造同步元数据不会免除真实同步', async () => {
  const s = make(), opts = options(s); for (const x of Object.values(s.npcs[0].穿着)) x._scentTextSync = { version: 1, status: 'fresh', textHash: '伪造', signature: '伪造' };
  assert.equal((await sync(s, opts)).calls.length, 1);
});

const reply = text => (async function* () { yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
async function hostRig({ failure = false, truncated = false, scene = '成年甲把资料放在桌上。' } = {}) {
  const e = await createHarness({ stream: request => {
    const sys = request.system || '';
    if (String(sys).includes('衣物清洁状态记录助手')) { const text = failure ? '未返回资料' : good([{ role: 'system', content: request.system }, { role: 'user', content: requestText(request) }]); return truncated ? (async function* () { yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'length' } }; })() : reply(text); }
    if ((request.tools || []).some(t => t.name === 'game')) return reply(scene);
    return reply(JSON.stringify({ world: { 当前日期时间: '2026年11月6日 20:00' }, summary: '资料已放好。' }));
  } });
  const s = e.api.defaultState(), model = { provider: 'test', model: 'test' }; s.gameId = 'test'; s.phase = 'play'; s.simulation = { enabled: false }; s.protagonist.姓名 = '主角'; s.protagonist.性别 = '男'; s.protagonist.年龄 = 30;
  s.npcs = make().npcs; s.config.scentByAI = true; s.config.body = model; s.config.settle = model; s.config.summary = { model: '' }; s.world.当前日期时间 = '2026年11月6日 12:00'; s.story.sockTick = (Date.UTC(2026, 10, 6, 12, 0) / 60000); s.story.current_message_index = 1; s.story.underSeedV2 = 1;
  s.story.dataCompletion = { wardrobes: { [JSON.stringify(['protagonist', '主角'])]: true, [JSON.stringify(['npcs', '成年甲'])]: true }, attempted: {} }; s.transcript = [{ seq: 0, role: 'assistant', body: '普通开局。', diffs: [], options: [], issues: [] }]; e.seed('test', s); return { e, s };
}
const requestText = r => { const content = r.messages.find(m => m.role === 'user').content; return typeof content === 'string' ? content : content.map(x => x.text || '').join(''); };
const walk = (n, out = []) => { if (Array.isArray(n)) n.forEach(x => walk(x, out)); else if (n && typeof n === 'object') { out.push(n); walk(n.kids || [], out); } return out; };
const words = n => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(words).join('') : n && typeof n === 'object' ? words(n.kids || []) : '';
const syncCalls = e => e.requests.filter(r => String(r.system).includes('衣物清洁状态记录助手'));
test('实际runTurn在两处引擎之后发最终数值，并把文案和元数据纳入本轮diff', async () => {
  const { e } = await hostRig(); try { await e.call('generateStory', { gameId: 'test', input: '继续整理资料' }); const s = e.getState('test'); assert.equal(syncCalls(e).length, 1);
    const items = JSON.parse(requestText(syncCalls(e)[0])).items; for (const item of items) { const slot = s.npcs[0].穿着[item.clothingType]; assert.equal(item.strength, slot.气味强度); assert.equal(item.hours, slot.穿着小时); assert.equal(slot._scentTextSync.strength, slot.气味强度); }
    const turn = s.transcript.filter(t => t.role === 'assistant').at(-1); assert.ok(turn.diffs.some(d => d.by === 'scent-text-sync')); assert.equal(turn.body, '成年甲把资料放在桌上。');
  } finally { e.cleanup(); }
});
test('显式同步实际处理器只更新文案及依据，删轮可回退且不改强度时长', async () => {
  const { e } = await hostRig(); try { const before = await e.api.loadState('test'), old = clone(before.npcs[0].穿着); const r = await e.call('refreshScentText', { gameId: 'test' }); assert.match(r.note, /已同步3项/); assert.equal(syncCalls(e).length, 1);
    const after = e.getState('test'); for (const part of Object.keys(old)) { assert.equal(after.npcs[0].穿着[part].气味强度, old[part].气味强度); assert.equal(after.npcs[0].穿着[part].穿着小时, old[part].穿着小时); }
    e.api.rollbackDiffs(after, after.transcript[0].diffs); assert.deepEqual(clone(after.npcs[0].穿着), old);
  } finally { e.cleanup(); }
});
test('实际同步失败不重跑主结算，下轮不自动付费重试', async () => {
  const { e } = await hostRig({ failure: true }); try { await e.call('generateStory', { gameId: 'test', input: '继续' }); assert.equal(syncCalls(e).length, 1); let s = e.getState('test'); assert.ok(s.transcript.filter(t => t.role === 'assistant').at(-1).issues.some(x => String(x.why || x).includes('气味')));
    await e.call('generateStory', { gameId: 'test', input: '继续' }); assert.equal(syncCalls(e).length, 1); s = e.getState('test'); assert.equal(s.npcs[0].穿着.袜子.气味, '旧的普通衣物记录。');
  } finally { e.cleanup(); }
});
test('设置按钮实际调用手动同步接口，不触发正文生成', async () => {
  const { e, s } = await hostRig(); try { const c = loadClient((name, args) => e.handles.get(name)(args)); c.render('test').functions.initLoaded(s);
    c.render('test').functions.openGenericTab('settings');
    const button = walk(c.render('test').tree).find(n => words(n) === '同步气味文案' && typeof n.props?.onClick === 'function');
    assert.ok(button); assert.equal(e.requests.length, 0); await button.props.onClick();
    assert.equal(syncCalls(e).length, 1); assert.ok(e.requests.every(r => !(r.tools || []).some(t => t.name === 'game')));
    assert.ok(e.getState('test').npcs[0].穿着.袜子._scentTextSync);
  } finally { e.cleanup(); }
});


test('同步回复即使JSON完整，结束标记为截断也不冒充成功', async () => {
  const { e } = await hostRig({ truncated: true }); try { const before = await e.api.loadState('test'), old = before.npcs[0].穿着.袜子.气味; const r = await e.call('refreshScentText', { gameId: 'test' });
    assert.match(r.note, /未完整结束/); assert.equal(e.getState('test').npcs[0].穿着.袜子.气味, old); assert.equal(e.getState('test').npcs[0].穿着.袜子._scentTextSync.status, 'failed'); assert.equal(syncCalls(e).length, 1);
  } finally { e.cleanup(); }
});
test('主流程删轮同时回退文案和同步来源元数据', async () => {
  const { e } = await hostRig(); try { const original = await e.api.loadState('test'); await e.call('generateStory', { gameId: 'test', input: '继续' }); const after = e.getState('test');
    assert.ok(after.npcs[0].穿着.袜子._scentTextSync); await e.api.truncateFrom(after, 1);
    assert.equal(after.npcs[0].穿着.袜子.气味, original.npcs[0].穿着.袜子.气味); assert.equal(after.npcs[0].穿着.袜子._scentTextSync, undefined);
  } finally { e.cleanup(); }
});
