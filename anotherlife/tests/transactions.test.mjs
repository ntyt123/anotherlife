import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuxiliaryTransactions } from '../lib/state-transactions.mjs';
import { createHarness } from './harness.mjs';

function memoryStore() {
  const files = new Map(); let extras = { notes: { items: [{ id: 'old' }] } }; const path = (id) => 'simulator-' + id;
  const tx = createAuxiliaryTransactions({ statePath: path, readJson: async (key) => files.get(key) ?? null, writeJson: async (key, value) => files.set(key, structuredClone(value)), readExtras: async () => structuredClone(extras), writeExtras: async (id, value) => { extras = structuredClone(value); } });
  return { files, path, tx, getExtras: () => extras };
}
test('跨文件写入中断，重启时恢复旧关联数据', async () => {
  const store = memoryStore(); store.files.set(store.path('g'), { _revision: 1 });
  store.files.set(store.tx.path('g'), { _type: 'anotherlife-transaction', nextRevision: 2, previousExtras: { notes: { items: [{ id: 'before' }] } } });
  await store.tx.recover('g'); assert.equal(store.getExtras().notes.items[0].id, 'before'); assert.equal(store.files.get(store.tx.path('g')), null); assert.equal(store.files.get(store.path('g'))._revision, 1);
});
test('主档已提交但事务标记未清理，不回滚已提交的关联数据', async () => {
  const store = memoryStore(); await store.tx.commit('g', { _revision: 2 }, { notes: { items: [{ id: 'new' }] } }, async () => store.files.set(store.path('g'), { _revision: 2 }));
  store.files.set(store.tx.path('g'), { _type: 'anotherlife-transaction', nextRevision: 2, previousExtras: { notes: { items: [{ id: 'before' }] } } });
  await store.tx.recover('g'); assert.equal(store.getExtras().notes.items[0].id, 'new');
});
test('事务回滚恢复原关联数据且不覆盖原主档', async () => {
  const store = memoryStore(); store.files.set(store.path('g'), { _revision: 1 });
  await assert.rejects(store.tx.commit('g', { _revision: 2 }, { notes: { items: [{ id: 'new' }] } }, async () => { throw Error('模拟写入失败'); }));
  assert.equal(store.getExtras().notes.items[0].id, 'old'); assert.equal(store.files.get(store.path('g'))._revision, 1); assert.equal(store.files.get(store.tx.path('g')), null);
});
test('实际宿主读取会恢复遗留事务，但不改主档', async () => {
  const e = await createHarness(); const state = e.api.defaultState(); state._revision = 1; e.seed('test', state);
  const before = e.files.get(e.api.statePath('test')); e.files.set(e.api.statePath('test') + '.txn.json', JSON.stringify({ _type: 'anotherlife-transaction', nextRevision: 2, previousExtras: { notes: { items: [{ id: 'recovered' }] }, weibo: null, threads: null } }));
  await e.call('getState', { gameId: 'test' }); assert.equal(JSON.parse(e.files.get('memory/simulator-notes-test.json')).items[0].id, 'recovered'); assert.equal(e.files.get(e.api.statePath('test')), before); e.cleanup();
});
test('快照完整恢复微博、笔记和神谕会话，并保留恢复前备份', async () => {
  const e = await createHarness(); const state = e.api.defaultState(); state.extraInfo = '快照时'; e.seed('test', state);
  e.files.set('memory/simulator-notes-test.json', JSON.stringify({ items: [{ id: 'saved-note' }] })); e.files.set('memory/simulator-threads-test.json', JSON.stringify({ active: 'saved', threads: [{ id: 'saved', messages: [] }] })); e.files.set(e.api.weiboCachePath('test'), JSON.stringify({ 时间线: [{ 作者: '作者', 正文: '快照正文', 评论列表: [] }] }));
  const snapshot = await e.call('snapSave', { gameId: 'test', name: '测试快照' }); state.extraInfo = '恢复前'; e.seed('test', state); e.files.set('memory/simulator-notes-test.json', JSON.stringify({ items: [{ id: 'new-note' }] }));
  await e.call('snapRestore', { gameId: 'test', id: snapshot.id }); assert.equal(e.getState('test').extraInfo, '快照时'); assert.equal(JSON.parse(e.files.get('memory/simulator-notes-test.json')).items[0].id, 'saved-note'); assert.equal(JSON.parse(e.files.get('memory/simulator-threads-test.json')).active, 'saved'); assert.ok([...e.files].some(([key, value]) => key.includes('before-restore') && JSON.parse(value).state.extraInfo === '恢复前')); e.cleanup();
});
test('截断只在提交成功后清理未来轮次的生成回复', async () => {
  const e = await createHarness(); const state = e.api.defaultState(); state.gameId = 'test'; state.story.current_message_index = 3; state.transcript = [{ seq: 0, role: 'assistant', body: '开场', diffs: [] }, { seq: 1, role: 'assistant', body: '第一轮', diffs: [] }, { seq: 2, role: 'assistant', body: '第二轮', diffs: [] }];
  const cache = { 时间线: [{ 作者: '作者', 正文: '微博正文', 评论列表: [{ 谁: '作者', 内容: '开场回复', 回复: true, 轮次: 0 }, { 谁: '作者', 内容: '未来回复', 回复: true, 轮次: 2 }] }] }; const original = JSON.stringify(cache); e.files.set(e.api.weiboCachePath('test'), original);
  await e.api.truncateFrom(state, 1); assert.equal(e.files.get(e.api.weiboCachePath('test')), original); await e.api.saveState(state); const comments = JSON.parse(e.files.get(e.api.weiboCachePath('test'))).时间线[0].评论列表; assert.equal(comments.length, 1); assert.equal(comments[0].内容, '开场回复'); e.cleanup();
});
test('时间解析失败不会沿用上一轮的小时增量', async () => {
  const e = await createHarness(); const state = e.api.defaultState(); state._lastDh = 10; state.world.当前日期时间 = '无法解析的时间'; e.api.tickSockScent(state, '正文'); assert.equal(state._lastDh, 0); e.cleanup();
});
