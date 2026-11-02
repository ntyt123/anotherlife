import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeiboCache } from '../lib/weibo-core.mjs';
import { createHarness, clone } from './harness.mjs';

function seed(env) {
  const s = env.api.defaultState(); s.gameId = 'test'; s.story.current_message_index = 1; s.protagonist.姓名 = '玩家'; s.transcript = [{ seq: 0, role: 'assistant', body: '开场', diffs: [] }]; env.seed('test', s);
  const cache = normalizeWeiboCache({ 日期: '2020-01-01', 热搜: [], 时间线: [{ 作者: '作者甲', 正文: '唯一微博正文', 评论列表: [{ 谁: '评论甲', 内容: '甲的原评论' }, { 谁: '评论乙', 内容: '乙的原评论' }] }] });
  env.files.set(env.api.weiboCachePath('test'), JSON.stringify(cache)); return cache;
}
test('评论保存稳定帖子/父评论/动作ID，重启后队列仍在', async () => {
  const e = await createHarness(); const cache = seed(e), post = cache.时间线[0], parent = post.评论列表[1];
  const r = await e.call('queueWeiboComment', { gameId: 'test', postId: post.id, parentCommentId: parent.id, actionId: 'action-a', 评论: '我的评论' });
  assert.equal(r.item.id, 'action-a'); assert.equal(r.item.parentCommentId, parent.id);
  const saved = e.getState('test'); assert.equal(saved.weiboPending[0].id, 'action-a');
  const restart = await createHarness(); for (const [key, value] of e.files) restart.files.set(key, value);
  const loaded = await restart.api.loadState('test'); assert.equal(restart.api.取待发评论('test', 1, loaded)[0].id, 'action-a'); e.cleanup(); restart.cleanup();
});
test('同一个动作重传不会重复保存', async () => {
  const e = await createHarness(); const post = seed(e).时间线[0]; const args = { gameId: 'test', postId: post.id, actionId: 'a', 评论: '一次评论' };
  await e.call('queueWeiboComment', args); await e.call('queueWeiboComment', args); assert.equal(e.getState('test').wbMine.length, 1); assert.equal(e.getState('test').weiboPending.length, 1); e.cleanup();
});
test('同一个人同轮回复两次均保留，重生成替换同轮而不重复', async () => {
  const e = await createHarness(); const post = seed(e).时间线[0];
  for (let i = 0; i < 2; i++) await e.call('queueWeiboComment', { gameId: 'test', postId: post.id, parentCommentId: post.评论列表[i].id, actionId: 'a' + i, 评论: '我的评论' + i });
  const s = await e.api.loadState('test'); const actions = s.weiboPending;
  const body = '正文\n' + [0, 1].map((i) => `:::weibo_reply\n动作ID|a${i}\n谁|同一个人\n回谁|玩家\n内容|回复${i}\n:::`).join('\n');
  assert.equal(await e.api.处理微博回复(s, 'test', body, actions, 1), '正文'); await e.api.saveState(s);
  let replies = JSON.parse(e.files.get(e.api.weiboCachePath('test'))).时间线[0].评论列表.filter((c) => c.回复);
  assert.equal(replies.length, 2); assert.deepEqual(replies.map((c) => c.replyToActionId), ['a0', 'a1']);
  await e.api.处理微博回复(s, 'test', body.replace('回复0', '改写0'), actions, 1); await e.api.saveState(s);
  replies = JSON.parse(e.files.get(e.api.weiboCachePath('test'))).时间线[0].评论列表.filter((c) => c.回复);
  assert.equal(replies.length, 2); assert.equal(replies[0].内容, '改写0'); e.cleanup();
});
test('刷新掉目标帖后，可以使用已保存的目标快照关联回复', async () => {
  const e = await createHarness(); const post = seed(e).时间线[0];
  await e.call('queueWeiboComment', { gameId: 'test', postId: post.id, actionId: 'a', 评论: '我的评论' });
  e.files.set(e.api.weiboCachePath('test'), JSON.stringify({ 日期: '2020-01-02', 时间线: [] }));
  const s = await e.api.loadState('test'); await e.api.处理微博回复(s, 'test', '正文\n:::weibo_reply\n动作ID|a\n谁|作者甲\n内容|答复\n:::', s.weiboPending, 1); await e.api.saveState(s);
  const cache = JSON.parse(e.files.get(e.api.weiboCachePath('test'))); assert.equal(cache.时间线[0].id, post.id); assert.equal(cache.时间线[0].评论列表.filter((c) => c.回复).length, 1); e.cleanup();
});
test('导出导入包含独立微博、笔记和新版神谕会话，导入前自动备份', async () => {
  const e = await createHarness(); seed(e);
  e.files.set('memory/simulator-notes-test.json', JSON.stringify({ items: [{ id: 'note-a', title: '笔记', content: '内容' }] }));
  e.files.set('memory/simulator-threads-test.json', JSON.stringify({ active: 'thread-a', threads: [{ id: 'thread-a', title: '会话', messages: [{ role: 'user', content: '问句' }] }] }));
  const pack = JSON.parse((await e.call('exportSession', { gameId: 'test' })).json);
  assert.equal(pack._v, 2); assert.equal(pack.extras.notes.items[0].id, 'note-a'); assert.equal(pack.extras.threads.active, 'thread-a'); assert.ok(pack.extras.weibo.时间线.length);
  const target = e.api.defaultState(); target.gameId = 'target'; target.story.current_message_index = 3; target.extraInfo = '导入前'; target.transcript = [{ seq: 0, role: 'assistant', body: '原来的正文' }]; e.seed('target', target);
  await e.call('importSession', { gameId: 'target', json: JSON.stringify(pack) });
  assert.equal(e.getState('target').protagonist.姓名, '玩家'); assert.equal(JSON.parse(e.files.get('memory/simulator-notes-target.json')).items[0].id, 'note-a');
  assert.ok([...e.files].some(([key, text]) => key.includes('before-import') && JSON.parse(text).state.extraInfo === '导入前')); e.cleanup();
});
test('主档保存失败，已写的关联数据会恢复', async () => {
  let fail = false; const e = await createHarness({ writeFailure: (key) => fail && key.includes('simulator-test.json') ? Error('模拟磁盘失败') : null }); const post = seed(e).时间线[0]; const old = e.files.get(e.api.weiboCachePath('test')); fail = true;
  await assert.rejects(e.call('queueWeiboComment', { gameId: 'test', postId: post.id, actionId: 'a', 评论: '不应保存' }));
  assert.equal(e.files.get(e.api.weiboCachePath('test')), old); assert.equal(e.getState('test').wbMine?.length || 0, 0); e.cleanup();
});
