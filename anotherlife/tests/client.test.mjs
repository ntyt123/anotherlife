import { loadClient } from './client-harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';



test('前端实际 factory/apply 可以加载并完成注册', () => {
  const client = loadClient(); assert.ok(client.registered.includes('registerComposerAction')); assert.ok(client.registered.includes('registerPanel'));
});
test('多个回复按动作ID落在各自父评论，不全挂第一条', () => {
  const client = loadClient(); const post = { id: 'p', 作者: '作者', 正文: '正文', 评论列表: [{ id: 'c1', 谁: '甲', 内容: '甲原文' }, { id: 'c2', 谁: '乙', 内容: '乙原文' }, { id: 'r1', 谁: '同一人', 内容: '回答甲', 回复: true, 回谁: '玩家', replyToActionId: 'a1' }, { id: 'r2', 谁: '同一人', 内容: '回答乙', 回复: true, 回谁: '玩家', replyToActionId: 'a2' }] };
  const mine = [{ id: 'a1', postId: 'p', parentCommentId: 'c1', 评论: '我的甲' }, { id: 'a2', postId: 'p', parentCommentId: 'c2', 评论: '我的乙' }];
  const groups = client.api.groupWeiboThreads(post, mine); assert.equal(groups.groups[0].mine[0].replies[0].内容, '回答甲'); assert.equal(groups.groups[1].mine[0].replies[0].内容, '回答乙'); assert.equal(groups.orphanReplies.length, 0);
});
test('无可靠ID的旧回复单独保留，不猜测归属', () => {
  const client = loadClient(); const result = client.api.groupWeiboThreads({ 作者: '作者', 正文: '正文', 评论列表: [{ 谁: '甲', 内容: '评论' }, { 谁: '乙', 内容: '旧回复', 回复: true, 回谁: '玩家' }] }, [{ 作者: '作者', 正文: '正文', 回谁: '甲', 评论: '我的评论' }]);
  assert.equal(result.groups[0].mine[0].replies.length, 0); assert.equal(result.orphanReplies[0].内容, '旧回复');
});
test('实际前端 call 无损接收超过接口上限的真实宿主状态', async () => {
  const host = await createHarness(); const state = host.api.defaultState(); state.gameId = 'test'; state.transcript = [{ seq: 0, role: 'assistant', body: '中文😀'.repeat(500000) }]; host.seed('test', state);
  const client = loadClient((name, args) => host.handles.get(name)(args)); const response = await client.api.call('getState', {}, 'test'); assert.equal(response.transcript[0].body, state.transcript[0].body); host.cleanup();
});
test('App 主模型思考强度处理函数可在同级控件调用', async () => {
  const requests = []; const client = loadClient(async (name, args) => { requests.push([name, args]); if (name.endsWith('/ping')) return { protocol: 15 }; return { gameId: 'test', config: { reasoning: args.reasoning || {} }, transcript: [] }; });
  const host = await createHarness(); const state = host.api.defaultState(); state.gameId = 'test'; state.phase = 'play';
  client.render().functions.initLoaded(state);
  const { functions } = client.render(); await functions.pickBodyReason('high'); assert.ok(requests.some(([name, args]) => name.endsWith('save-reasoning') && args.reasoning.body === 'high')); host.cleanup();
});
test('旧宿主只收到版本探测，不执行保存或生成请求', async () => {
  const requests = []; const client = loadClient(async (name) => { requests.push(name); return { protocol: 1 }; });
  await assert.rejects(client.api.call('queueWeiboComment', { 评论: '测试' }, 'test'), /重启 DSH/); assert.equal(requests.length, 1); assert.ok(requests[0].endsWith('/ping'));
});
test('仓库设置组件外提后仍能独立渲染', () => { const client = loadClient(); assert.equal(client.api.GitCfg({ ask: async () => true }).type, 'div'); });
test('等长内部编辑会更新实际服务端正文版本与前端指纹', async () => {
  const host = await createHarness(); const state = host.api.defaultState(); state.story.current_message_index = 2; state.transcript = [{ seq: 1, role: 'assistant', body: '甲'.repeat(500), diffs: [] }]; host.seed('test', state);
  const client = loadClient((name, args) => host.handles.get(name)(args)); const before = await client.api.call('getState', {}, 'test');
  const after = await client.api.call('editTurnBody', { seq: 1, role: 'assistant', body: '甲'.repeat(47) + '乙' + '甲'.repeat(452) }, 'test');
  assert.notEqual(client.api.txFingerprint(before), client.api.txFingerprint(after)); host.cleanup();
});
test('App 拒绝陈旧状态与已离开的世界线回包', () => {
  const client = loadClient(); let current = client.render('test'); current.functions.commit({ gameId: 'test', _revision: 20, extraInfo: '新' }); current = client.render('test'); current.functions.commit({ gameId: 'test', _revision: 10, extraInfo: '旧' }); current = client.render('test'); assert.equal(current.functions.getState().extraInfo, '新');
  current = client.render('other'); current.functions.commit({ gameId: 'test', _revision: 30, extraInfo: '错误世界线' }); current = client.render('other'); assert.notEqual(current.functions.getState().extraInfo, '错误世界线');
});

test('世界页隐藏补充展示但保留原始备注数据',async()=>{const {createHarness}=await import('./harness.mjs'),host=await createHarness(),state=host.api.defaultState();host.cleanup();state.gameId='test';state.phase='play';state.extraInfo='原始补充信息保持完整';const client=loadClient();client.render().functions.initLoaded(state);client.render().functions.openGenericTab('world');const view=client.render(),texts=[];function visit(n){if(Array.isArray(n))n.forEach(visit);else if(n&&typeof n==='object')visit(n.kids||[]);else if(typeof n==='string')texts.push(n);}visit(view.tree);assert.equal(texts.includes('补充'),false);assert.equal(texts.some(x=>x.includes('原始补充信息保持完整')),false);assert.equal(view.functions.getState().extraInfo,state.extraInfo);assert.equal(view.functions.getOpeningDraft().extraInfo,state.extraInfo);assert.equal(client.source.includes("block('补充', h(KVView"),false);});
