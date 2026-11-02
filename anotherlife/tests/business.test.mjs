import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { BASIC_WEAR_KEYS, cleanGeneratedValue, restrictCompletion, completionPlan, mergeRecords, dataIntegrityIssues, wardrobeTasks } from '../lib/data-integrity.mjs';
import { splitStory, ROUTE_NAMES } from '../lib/story-parser.mjs';

const textStream = (text) => (async function* () { yield { type: 'text-delta', index: 0, text }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
const toolStream = (name, data) => (async function* () { yield { type: 'tool-call-delta', id: 'test-call', index: 0, name, argumentsDelta: JSON.stringify(data) }; yield { type: 'finish', reason: { kind: 'tool-calls' } }; })();
const plain = (x) => JSON.parse(JSON.stringify(x));
function outfit() {
  return Object.fromEntries(BASIC_WEAR_KEYS.map((k) => [k, { 物品: { 上衣: '日常衬衫', 下衣: '普通长裤', 鞋子: '运动鞋' }[k] || '', 稀有度: ['上衣', '下衣', '鞋子'].includes(k) ? 'N' : '', 状态: '', 简介: ['上衣', '下衣', '鞋子'].includes(k) ? '按日常活动选择，表面留着清洗后的折痕' : '' }]));
}
function stateOf(e) {
  const s = e.api.defaultState(); s.gameId = 'test'; s.phase = 'play';
  Object.assign(s.protagonist, { 姓名: '玩家', 性别: '男', 年龄: 30, 金钱: 100000, 住所: [{ 位置: '甲城', 买入价格: '', 状态: '自有房产' }] });
  s.world.当前日期时间 = '2026年8月26日 09:30';
  s.npcs = [{ 姓名: '甲', 性别: '男', 年龄: 30, 身份: '同事', 联系方式: { 电话: '1001', 微信: '', QQ: '' } }, { 姓名: '乙', 性别: '男', 年龄: 30, 身份: '同事', 联系方式: { 电话: '1002', 微信: '', QQ: '' } }];
  return s;
}
function ready(s) {
  const map = { [JSON.stringify(['protagonist', s.protagonist.姓名])]: true };
  for (const n of s.npcs) map[JSON.stringify(['npc', n.姓名])] = true;
  s.story.dataCompletion = { wardrobes: map };
}

for (const [name, input] of [
  ['other', { other: [{ path: ['实体资产'], value: [{ 名称: '测试公司', 类型: '企业' }] }] }],
  ['顶层字段', { 实体资产: [{ 名称: '测试公司', 类型: '企业' }] }],
  ['旧diffs', { diffs: [{ path: ['实体资产'], to: [{ 名称: '测试公司', 类型: '企业' }], _had: true, _prev: '不能信任模型提供的回滚值' }] }],
]) test('资产提交格式' + name + '转换、持久化和回滚', async () => {
  const e = await createHarness(); const s = stateOf(e), diagnostics = [];
  const ds = e.api.settleToDiffs(s, input, diagnostics); assert.equal(ds.length, 1); assert.equal(diagnostics.length, 0);
  e.api.applyDiffs(s, ds); assert.equal(s.实体资产[0].名称, '测试公司'); assert.ok(Array.isArray(ds[0]._prev));
  await e.api.saveState(s); assert.equal((await e.api.loadState('test')).实体资产[0].名称, '测试公司');
  e.api.rollbackDiffs(s, ds); assert.equal(s.实体资产.length, 0); e.cleanup();
});
test('other同时维护技能和虚拟资产，不再静默丢弃', async () => {
  const e = await createHarness(), s = stateOf(e);
  const ds = e.api.settleToDiffs(s, { other: [{ path: ['skills_items', '技能'], value: [{ 名称: '项目管理' }] }, { path: ['虚拟资产'], value: [{ 名称: '测试股权' }] }] });
  e.api.applyDiffs(s, ds); assert.equal(s.skills_items.技能[0].名称, '项目管理'); assert.equal(s.虚拟资产[0].名称, '测试股权'); e.cleanup();
});
test('额外变更拒绝危险路径和内部状态，保留其他合法变更', async () => {
  const e = await createHarness(), s = stateOf(e), diagnostics = [];
  const ds = e.api.settleToDiffs(s, { other: [{ path: ['protagonist', '__proto__', 'bad'], value: true }, { path: ['story', 'current_message_index'], value: 99 }, { path: ['实体资产'], value: [{ 名称: '合法资产' }] }] }, diagnostics);
  assert.equal(ds.length, 1); assert.equal(diagnostics.length, 2); e.api.applyDiffs(s, ds); assert.equal({}.bad, undefined); assert.notEqual(s.story.current_message_index, 99); e.cleanup();
});
test('冲突路径不会任意取值，同值重复只应用一次', async () => {
  const e = await createHarness(), s = stateOf(e), diagnostics = [];
  const conflicting = e.api.settleToDiffs(s, { protagonist: { 金钱: 300 }, other: [{ path: ['protagonist', '金钱'], value: 200 }] }, diagnostics);
  assert.equal(conflicting.length, 0); assert.ok(diagnostics.some((x) => x.kind === 'conflicting-update'));
  const same = e.api.settleToDiffs(s, { protagonist: { 金钱: 300 }, other: [{ path: ['protagonist', '金钱'], value: 300 }] }); assert.equal(same.length, 1); e.cleanup();
});
test('错误类型的资产更新有诊断，不把原列表清空', async () => {
  const e = await createHarness(), s = stateOf(e), diagnostics = []; s.实体资产 = [{ 名称: '原有公司' }];
  const ds = e.api.settleToDiffs(s, { 实体资产: { 名称: '错误对象' } }, diagnostics); e.api.applyDiffs(s, ds); assert.equal(s.实体资产[0].名称, '原有公司'); assert.equal(diagnostics.length, 1); e.cleanup();
});
test('生成字段去占位词，不损坏正常衣物名称和零值', () => {
  const v = cleanGeneratedValue({ 收益: '未提供', 名称: '个人经纪公司（名称未提供）', 物品: '无袖上衣', 金额: 0, 空: false });
  assert.deepEqual(v, { 收益: '', 名称: '个人经纪公司', 物品: '无袖上衣', 金额: 0, 空: false });
});
test('结算快照保留普通六槽及空资产数组，物品空值仍是字符串', async () => {
  const e = await createHarness(), s = stateOf(e); s.npcs[0].穿着 = Object.fromEntries(BASIC_WEAR_KEYS.map((k) => [k, { 物品: '', 稀有度: '', 状态: '', 简介: '' }]));
  const snap = JSON.parse(e.api.settleSnapshot(s));
  for (const k of BASIC_WEAR_KEYS) assert.equal(snap.npcs[0].穿着[k].物品, '');
  assert.deepEqual(snap.实体资产, []); assert.deepEqual(snap.虚拟资产, []); e.cleanup();
});
test('补全限制只准普通服装房屋和企业，不采用金钱和其他字段', () => {
  const state = { protagonist: { 金钱: 100, 住所: [{ 名称: '旧房', 买入价格: '300万' }] }, npcs: [{ 姓名: '甲' }], 实体资产: [] };
  const r = restrictCompletion(state, { protagonist: { 金钱: 1, 收支: { 月收入: 99 }, 住所: [{ 名称: '新房', 总面积: 93 }], 穿着: { 上衣: { 物品: '衬衫', 气味: '不应进入这个阶段', 额外字段: '不应进入' }, 未允许部位: { 物品: '不应进入' } } }, chars: [{ 姓名: '陌生人', 穿着: outfit() }, { 姓名: '甲', 穿着: outfit(), 其他: '不应进入' }] });
  assert.equal(r.protagonist.金钱, undefined); assert.equal(r.protagonist.收支, undefined); assert.equal(r.protagonist.住所.length, 2); assert.equal(r.protagonist.穿着.上衣.气味, undefined); assert.equal(r.protagonist.穿着.未允许部位, undefined); assert.equal(r.chars.length, 1); assert.equal(r.chars[0].其他, undefined);
});
test('资料补全合并旧房而非覆盖，空补丁不抹掉已有价格', () => {
  const r = mergeRecords([{ 名称: '旧房', 买入价格: '300万', 备注: '保留' }], [{ 名称: '旧房', 买入价格: '', 总面积: 80 }, { 名称: '新房', 总面积: 93 }]);
  assert.equal(r.length, 2); assert.equal(r[0].买入价格, '300万'); assert.equal(r[0].备注, '保留'); assert.equal(r[0].总面积, 80);
});
test('真实资料补全接口保留余额正文并将新增数据纳入回滚', async () => {
  let e; e = await createHarness({ stream: () => toolStream('complete_records', { protagonist: { 穿着: outfit(), 住所: [{ 名称: '新住宅', 总面积: 93, 楼层: 3, 户型: '两房', 产权人: '玩家' }], 金钱: 1, 收支: { 月收入: 999 } }, chars: [{ 姓名: '甲', 穿着: outfit() }, { 姓名: '乙', 穿着: outfit() }], 实体资产: [{ 名称: '测试公司办公室', 类型: '经营场所', 产权: '租赁' }] }) });
  const s = stateOf(e); s.config.settle = { provider: 'test', model: 'test-model' }; s.story.current_message_index = 1; s.transcript = [{ seq: 0, role: 'assistant', body: '公司已经成立，办公室办妥。', diffs: [] }]; e.seed('test', s);
  const r = await e.call('repairBasicData', { gameId: 'test' }); const saved = e.getState('test');
  assert.equal(saved.protagonist.金钱, 100000); assert.notEqual(saved.protagonist.收支.月收入, 999); assert.equal(saved.protagonist.住所.length, 2); assert.equal(saved.transcript[0].body, s.transcript[0].body); assert.equal(e.requests.length, 1); assert.equal(e.api.RUNNING.has('test'), false);
  assert.ok(r.dataMaintenance.issues.some((x) => x.why.includes('账务改动')));
  e.api.rollbackDiffs(saved, saved.transcript[0].diffs); assert.equal(saved.protagonist.住所.length, 1); assert.equal(saved.实体资产.length, 0); e.cleanup();
});
test('资料补全失败不在下一轮自动反复调用，显式核对可重试', async () => {
  const e = await createHarness({ stream: () => textStream('{}') }), s = stateOf(e); s.config.settle = { provider: 'test', model: 'test-model' };
  const first = await e.api.completeBasicData(s, 'test', '', 1, false); assert.equal(first.called, true); assert.ok(first.issues.length);
  const next = await e.api.completeBasicData(s, 'test', '', 2, false); assert.equal(next.called, false); assert.equal(e.requests.length, 1);
  await e.api.completeBasicData(s, 'test', '', 2, true); assert.equal(e.requests.length, 2); e.cleanup();
});
test('实际生成结算other资产与房屋可保存，不仅底层差分可用', async () => {
  let e; const routes = ROUTE_NAMES.map((r, i) => (i + 1) + '. **[' + r + ']** 继续处理日常事务。').join('\n');
  e = await createHarness({ stream: (o) => (o.tools || []).some((t) => t.name === 'emit_state_update') ? toolStream('emit_state_update', { summary: '时间：今日。地点：办公室。发生的事：公司事务完成。', other: [{ path: ['实体资产'], value: [{ 名称: '测试公司', 类型: '企业' }] }], protagonist: { 住所: [{ 位置: '甲城', 状态: '自有房产' }, { 名称: '新住宅', 总面积: 93 }] } }) : textStream('公司已经成立，办公室办妥。\n\n### **行动选项**\n' + routes) });
  const s = stateOf(e); ready(s); s.config.settle = { provider: 'test', model: 'test-model' };
  const entry = await e.api.runTurn(s, '办理公司事务', '办理公司事务', { gameId: 'test' }); await e.api.saveState(s);
  const saved = await e.api.loadState('test'); assert.equal(saved.实体资产[0].名称, '测试公司'); assert.equal(saved.protagonist.住所.length, 2); assert.equal(entry.options.length, 8); assert.ok(entry.diffs.some((d) => d.path[0] === '实体资产')); e.cleanup();
});
test('购房没形成现金差分时真实回合记录明确账务问题', async () => {
  let e; e = await createHarness({ stream: (o) => (o.tools || []).some((t) => t.name === 'emit_state_update') ? toolStream('emit_state_update', { summary: '买房已签合同。' }) : (o.tools || []).some((t) => t.name === 'complete_records') ? toolStream('complete_records', { protagonist: { 住所: [{ 名称: '新住宅', 总面积: 93 }] } }) : textStream('玩家买了一套房，签了合同，定金先付。') });
  const s = stateOf(e); ready(s); s.config.settle = { provider: 'test', model: 'test-model' };
  const entry = await e.api.runTurn(s, '办理购房', '办理购房', { gameId: 'test' }); assert.equal(s.protagonist.金钱, 100000); assert.ok(entry.issues.some((x) => x.step === '账务' && x.why.includes('付款'))); assert.ok(entry.issues.some((x) => x.step === '选项')); e.cleanup();
});
for (const format of ['bold', 'numbered', 'wide', 'bare', 'split']) test('普通正文选项格式兼容：' + format, () => {
  const rows = ROUTE_NAMES.map((r, i) => format === 'bold' ? '**[' + r + ']** 处理日常事务。' : format === 'numbered' ? (i + 1) + '. **[' + r + ']** 处理日常事务。' : format === 'wide' ? '• 【' + r + '】处理日常事务。' : format === 'bare' ? '**' + r + '**：处理日常事务。' : '[' + r + ']\n处理日常事务。');
  const parsed = splitStory('故事正文。\n\n### **行动选项**\n' + rows.join('\n')); assert.equal(parsed.options.length, 8); assert.equal(parsed.body, '故事正文。'); assert.ok(!parsed.body.includes('处理日常事务'));
});

test('添加微信联系人不编账号，短信和微信名单相互独立', async () => {
  const e = await createHarness(), s = stateOf(e); e.seed('test', s);
  assert.equal((await e.call('phoneGet', { gameId: 'test', 平台: 'sms' })).contacts.length, 2); assert.equal((await e.call('phoneGet', { gameId: 'test', 平台: 'wechat' })).contacts.length, 0);
  await e.call('phoneAddContact', { gameId: 'test', 平台: 'wechat', name: '甲' }); await e.call('phoneAddContact', { gameId: 'test', 平台: 'wechat', name: '甲' });
  const wx = await e.call('phoneGet', { gameId: 'test', 平台: 'wechat' }); assert.equal(wx.contacts.length, 1); assert.equal(wx.contacts[0].微信, ''); assert.equal(wx.contacts[0].可发送, true); assert.equal(e.getState('test').手机.联系人.wechat.length, 1); assert.equal(e.requests.length, 0); e.cleanup();
});
test('新群无消息也在会话列表，且群资料不依赖联系人数量', async () => {
  const e = await createHarness(), s = stateOf(e); e.seed('test', s);
  await e.call('phoneGroupCreate', { gameId: 'test', 平台: 'wechat', 成员: ['甲', '乙'], 群名: '工作群' });
  const groups = await e.call('phoneGroupList', { gameId: 'test', 平台: 'wechat' }), threads = await e.call('phoneThreads', { gameId: 'test', 平台: 'wechat' });
  assert.equal(groups.groups.length, 1); assert.equal(threads.threads.length, 1); assert.equal(threads.threads[0].条数, 0); assert.equal(threads.threads[0].是否群, true); assert.equal((await e.call('phoneGet', { gameId: 'test', 平台: 'wechat' })).contacts.length, 0); e.cleanup();
});
test('微信与QQ同名群独立，删除一个平台不删另一个', async () => {
  const e = await createHarness(), s = stateOf(e); e.seed('test', s);
  for (const p of ['wechat', 'qq']) await e.call('phoneGroupCreate', { gameId: 'test', 平台: p, 成员: ['甲', '乙'], 群名: '工作群' });
  await e.call('phoneGroupDelete', { gameId: 'test', 平台: 'wechat', 群名: '工作群' }); assert.equal((await e.call('phoneGroupList', { gameId: 'test', 平台: 'wechat' })).groups.length, 0); assert.equal((await e.call('phoneGroupList', { gameId: 'test', 平台: 'qq' })).groups.length, 1); e.cleanup();
});
test('兼容旧群名键及已有QQ线程的平台推断', async () => {
  const e = await createHarness(), s = stateOf(e); s.手机.群 = { 旧微信群: { 成员: ['甲', '乙'], 建群时间: '' }, 旧QQ群: { 成员: ['甲', '乙'], 建群时间: '' } }; s.手机.线程['qq:群:旧QQ群'] = []; e.seed('test', s);
  assert.equal((await e.call('phoneGroupList', { gameId: 'test', 平台: 'wechat' })).groups[0].群名, '旧微信群'); assert.equal((await e.call('phoneGroupList', { gameId: 'test', 平台: 'qq' })).groups[0].群名, '旧QQ群'); e.cleanup();
});
test('添加联系人后实际发消息并保存；短信也能独立保存', async () => {
  const e = await createHarness({ stream: () => textStream(JSON.stringify({ reply: ['明天九点开会。'], 事实: [] })) }), s = stateOf(e); e.seed('test', s);
  await assert.rejects(e.call('phoneSend', { gameId: 'test', threadId: 'wechat:甲', text: '明天几点开会？' }), /添加联系人/);
  await e.call('phoneAddContact', { gameId: 'test', 平台: 'wechat', name: '甲' });
  for (const p of ['wechat', 'sms']) { const r = await e.call('phoneSend', { gameId: 'test', threadId: p + ':甲', text: '明天几点开会？' }); assert.equal(r.messages.length, 2); }
  assert.equal(e.getState('test').手机.线程['wechat:甲'][1].内容, '明天九点开会。'); assert.equal(e.getState('test').手机.线程['sms:甲'].length, 2); e.cleanup();
});
test('群聊实际使用指定平台的成员，不读取另一平台同名群', async () => {
  let prompt = ''; const e = await createHarness({ stream: (o) => { prompt = JSON.stringify({ system: o.system, messages: o.messages }); return textStream(JSON.stringify({ reply: [{ 谁: '甲', 内容: '收到会议通知。' }], 事实: [] })); } }), s = stateOf(e); e.seed('test', s);
  await e.call('phoneGroupCreate', { gameId: 'test', 平台: 'wechat', 成员: ['甲', '乙'], 群名: '工作群' });
  const r = await e.call('phoneSend', { gameId: 'test', threadId: 'wechat:群:工作群', text: '明天开会。' }); assert.equal(r.messages.length, 2); assert.ok(prompt.includes('甲') && prompt.includes('乙')); e.cleanup();
});

test('资料核对在模型等待时可停止，失败不覆盖真实内存主档', async () => {
  const e = await createHarness({ maxTimerMs: 1000, stream: (o) => ({ [Symbol.asyncIterator]() { return { next: () => new Promise((resolve) => o.signal.addEventListener('abort', () => resolve({ done: true }), { once: true })), return: async () => ({ done: true }) }; } }) });
  const s = stateOf(e); s.config.settle = { provider: 'test', model: 'test-model' }; s.story.current_message_index = 1; s.transcript = [{seq:0,role:'assistant',body:'开局正文。',diffs:[]}]; e.seed('test', s); const before = JSON.stringify(e.getState('test'));
  const p = e.call('repairBasicData', { gameId: 'test' }); const settled = p.then((value) => ({ value }), (error) => ({ error }));
  for (let i = 0; i < 100 && !e.requests.length; i++) await new Promise((r) => setTimeout(r, 5));
  await e.call('stopGenerate', { gameId: 'test' }); const result = await settled; assert.match(String(result.error?.message), /停止/); assert.equal(JSON.stringify(e.getState('test')), before); assert.equal(e.api.RUNNING.has('test'), false); e.cleanup();
});

test('正文提到行动选项时不误删正文词句', () => { const body='行动选项需要再商量。\n这是正常叙事。'; assert.equal(splitStory(body).body,body); });

test('普通办公室工作和租房入住不误触发企业购房补录', async () => {
  const e=await createHarness(),s=stateOf(e);ready(s);const body='玩家早上到办公室处理文件。晚上搬入租来的房子。';
  assert.equal(completionPlan(s,body,1,false).events.length,0);assert.equal(dataIntegrityIssues(s,s,body,[]).some(x=>x.step==='账务'||x.step==='房产'),false);e.cleanup();
});


test('重写在资料补全阶段停止也保留原正文和余额', async () => {
  let waiting = false;
  const stoppedStream = (o) => ({
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise((resolve) => o.signal.addEventListener('abort', () => resolve({ done: true }), { once: true })),
        return: async () => ({ done: true }),
      };
    },
  });
  const e = await createHarness({ maxTimerMs: 1000, stream: (o) => {
    if ((o.tools || []).some((t) => t.name === 'complete_records')) { waiting = true; return stoppedStream(o); }
    if ((o.tools || []).some((t) => t.name === 'emit_state_update')) return toolStream('emit_state_update', { summary: '本轮小结' });
    return textStream('新写的普通事务正文。');
  } });
  const s = stateOf(e); s.config.settle = { provider: 'test', model: 'test-model' }; s.story.current_message_index = 2;
  s.transcript = [{ seq: 0, role: 'assistant', body: '开场。', diffs: [] }, { seq: 1, role: 'user', body: '处理事务' }, { seq: 1, role: 'assistant', body: '应保留的原正文。', diffs: [] }];
  e.seed('test', s);
  const pending = e.call('regenFrom', { gameId: 'test', seq: 1 }).then((value) => ({ value }), (error) => ({ error }));
  for (let i = 0; i < 100 && !waiting; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(waiting, true); await e.call('stopGenerate', { gameId: 'test' }); const result = await pending;
  assert.match(String(result.error?.message), /停止/); assert.equal(e.getState('test').transcript.at(-1).body, '应保留的原正文。');
  assert.equal(e.getState('test').protagonist.金钱, 100000); assert.equal(e.api.RUNNING.has('test'), false); e.cleanup();
});

test('自动补全优先重要近期角色，不唤醒归档人物', async () => {
  const e=await createHarness(),s=stateOf(e);s.story.current_message_index=100;s.npcs=[{姓名:'归档人物',最近出场:1},{姓名:'重要人物',重要:true,最近出场:1},{姓名:'近期人物',最近出场:99}];
  const names=wardrobeTasks(s).map(n=>n.姓名);assert.equal(names.includes('归档人物'),false);assert.deepEqual(names,['玩家','重要人物','近期人物']);assert.ok(wardrobeTasks(s,'归档人物本轮重新出现。').some(n=>n.姓名==='归档人物'));e.cleanup();
});
