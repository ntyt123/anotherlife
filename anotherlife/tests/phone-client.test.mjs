import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClient } from './client-harness.mjs';
import { createHarness } from './harness.mjs';
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
function walk(node, out = []) { if (!node || typeof node !== 'object') return out; if (Array.isArray(node)) { node.forEach((x) => walk(x, out)); return out; } out.push(node); (node.kids || []).forEach((x) => walk(x, out)); return out; }
function words(node) { if (typeof node === 'string') return node; if (Array.isArray(node)) return node.map(words).join(''); return (node?.kids || []).map(words).join(''); }
function stateOf(host) { const s = host.api.defaultState(); s.gameId = 'test'; s.phase = 'play'; s.protagonist.姓名 = '玩家'; s.world.当前日期时间 = '2026年8月26日 09:30'; s.npcs = [{ 姓名: '甲', 性别: '男', 年龄: 30, 联系方式: { 电话: '1001', 微信: '', QQ: '' } }, { 姓名: '乙', 性别: '男', 年龄: 30, 联系方式: { 电话: '1002', 微信: '', QQ: '' } }]; return s; }
async function setup(stream) {
  const host = await createHarness({ stream }); const state = stateOf(host); host.seed('test', state);
  const client = loadClient((name, args) => { const h = host.handles.get(name); if (!h) throw Error('无接口：' + name); return h(args); });
  client.render('test').functions.initLoaded(state); client.render('test'); return { host, client, current: () => client.render('test').functions };
}
test('手机短信联系人详情实际渲染发短信按钮并打开短信线程', async () => {
  const { host, client, current } = await setup(); let f = current(); await f.phoneLoadContacts('sms'); f = current();
  const person = f.getPhone().phoneContacts[0]; f.setPhonePerson(person); f.setPhoneView('person'); f = current();
  const button = walk(f.phoneBody()).find((n) => n.type === 'button' && words(n) === '发短信'); assert.ok(button); button.props.onClick(); await tick();
  f = current(); assert.equal(f.getPhone().phoneView, 'thread'); host.cleanup();
});
test('短信缓存不会冒充微信联系人，微信空列表仍保留群和添加入口', async () => {
  const { host, current } = await setup(); let f = current(); await f.phoneLoadContacts('sms'); assert.equal(current().getPhone().phoneContacts.length, 2);
  f = current(); f.setPhoneApp2('wechat'); f = current(); assert.equal(f.getPhone().phoneContacts, null); await f.phoneLoadContacts('wechat'); f = current(); assert.equal(f.getPhone().phoneContacts.length, 0);
  f.setPhoneView('apphome'); f.setPhoneTab('book'); f = current(); const text = words(f.phoneBody()); assert.ok(text.includes('群聊')); assert.ok(text.includes('添加联系人')); host.cleanup();
});
test('添加微信好友后无须编造微信号也有发消息按钮', async () => {
  const { host, current } = await setup(); let f = current(); f.setPhoneApp2('wechat'); f = current();
  await f.phoneShowAddContact(); f = current(); assert.equal(f.getPhone().phoneView, 'addcontact');
  const candidates = walk(f.phoneBody()).filter((n) => n.type === 'button' && words(n) === '添加'); assert.equal(candidates.length, 2);
  await f.phoneAddSelected('甲'); f = current(); const person = f.getPhone().phoneContacts[0]; assert.equal(person.微信, '');
  f.setPhonePerson(person); f.setPhoneView('person'); f = current(); assert.ok(walk(f.phoneBody()).some((n) => n.type === 'button' && words(n) === '发消息')); host.cleanup();
});
test('联系人同平台乱序回包以最新请求为准，跨世界线回包不显示', async () => {
  const waiting = []; const host = await createHarness(); const client = loadClient(async (name) => name.endsWith('/ping') ? { protocol: 15 } : new Promise((resolve) => waiting.push(resolve)));
  client.render().functions.initLoaded(stateOf(host)); let f = client.render().functions;
  const a = f.phoneLoadContacts('sms'), b = f.phoneLoadContacts('sms'); await tick(); assert.equal(waiting.length, 2);
  waiting[1]({ ok: true, contacts: [{ 姓名: '新' }] }); await b; waiting[0]({ ok: true, contacts: [{ 姓名: '旧' }] }); await a;
  assert.equal(client.render().functions.getPhone().phoneContacts[0].姓名, '新');
  f = client.render().functions; const late = f.phoneLoadContacts('sms'); await tick(); client.render('other'); waiting[2]({ ok: true, contacts: [{ 姓名: '不应跨局' }] }); await late;
  assert.equal(client.render('other').functions.getPhone().phoneContacts, null); host.cleanup();
});
test('短信发送失败保留输入，联系人存在时走实际短信接口', async () => {
  const { host, current } = await setup(() => { throw Error('模拟发送失败'); });
  let f = current(); f.phoneOpenThread('甲', 'sms'); await tick(); f = current(); f.setPhoneIn('确认会议安排。'); f = current(); await f.phoneSendNow();
  f = current(); assert.equal(f.getPhone().phoneIn, '确认会议安排。'); assert.equal(f.getPhone().phoneBusy, false); assert.equal((host.getState('test').手机.线程['sms:甲'] || []).length, 0); host.cleanup();
});
test('离开聊天后旧线程回包不会覆盖新聊天', async () => {
  const waiting = []; const host = await createHarness(); const client = loadClient(async (name, args) => {
    if (name.endsWith('/ping')) return { protocol: 15 };
    if (name.endsWith('/phone-thread')) return new Promise((resolve) => waiting.push([args.threadId, resolve]));
    return { ok: true, threads: [] };
  });
  client.render().functions.initLoaded(stateOf(host)); let f = client.render().functions; f.phoneOpenThread('甲', 'sms'); await tick(); f = client.render().functions; f.phoneOpenThread('乙', 'sms'); await tick();
  waiting.find(([id]) => id === 'sms:乙')[1]({ ok: true, messages: [{ 内容: '乙的回复' }] }); await tick();
  waiting.find(([id]) => id === 'sms:甲')[1]({ ok: true, messages: [{ 内容: '甲的旧回复' }] }); await tick();
  assert.equal(client.render().functions.getPhone().phoneMsgs[0].内容, '乙的回复'); host.cleanup();
});
for (const protocol of [1, 2]) test('旧宿主协议' + protocol + '不会执行新版手机或维护接口', async () => {
  const calls = []; const client = loadClient(async (name) => { calls.push(name); return { protocol }; });
  await assert.rejects(client.api.call('repairBasicData', {}, 'test'), /重启 DSH/); assert.equal(calls.length, 1); assert.ok(calls[0].endsWith('/ping'));
});

test('客户端成功发送后清空输入且不回滚已保存消息', async () => {
  const { host, current } = await setup(() => (async function*(){ yield {type:'text-delta',index:0,text:'{"reply":["会议安排已收到。"],"事实":[]}'}; yield {type:'finish',reason:{kind:'stop'}}; })());
  let f = current(); f.phoneOpenThread('甲', 'sms'); await tick(); f=current(); f.setPhoneIn('确认会议安排。'); f=current(); await f.phoneSendNow(); f=current();
  assert.equal(f.getPhone().phoneIn, ''); assert.equal(f.getPhone().phoneMsgs[0].内容, '确认会议安排。'); assert.equal(f.getPhone().phoneMsgs[0].状态, 'ok'); assert.equal(host.getState('test').手机.线程['sms:甲'].length, 2); host.cleanup();
});
test('客户端新群创建后立即进入可发送的空会话', async () => {
  const { host, current } = await setup(); let f=current(); f.setPhoneApp2('wechat'); f.setPhoneGroupPick({群名:'工作群',成员:['甲','乙']}); f.setPhoneView('newgroup'); f=current();
  const buttons=walk(f.phoneBody()).filter(n=>n.type==='button'); const button=buttons.find(n=>/建群|创建/.test(words(n))); assert.ok(button); assert.equal(!!button.props.disabled,false); button.props.onClick(); await tick(); await tick(); f=current();
  assert.equal(f.getPhone().phoneView,'thread'); assert.equal(f.getPhone().phoneThreadId,'wechat:群:工作群'); assert.equal(f.getPhone().phoneMsgs.length,0); assert.ok(f.getPhone().phoneThreadList.some(t=>t.姓名==='工作群')); host.cleanup();
});
