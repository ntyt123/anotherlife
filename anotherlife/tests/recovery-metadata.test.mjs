import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';

test('临时恢复标记不进入导出或快照，恢复数据可导入空白局', async () => {
  const env = await createHarness(); const state = env.api.defaultState(); state.extraInfo = '备份数据';
  env.files.set(env.api.statePath('damaged'), '{损坏'); env.files.set(env.api.backupPath('damaged'), JSON.stringify(state));
  const exported = JSON.parse((await env.call('exportSession', { gameId: 'damaged' })).json);
  assert.equal(exported.state.recoveryInfo, undefined);
  const snapshot = await env.call('snapSave', { gameId: 'damaged', name: '恢复副本' });
  const saved = [...env.files].find(([key]) => key.endsWith('-' + snapshot.id + '.json'));
  assert.ok(saved); assert.equal(JSON.parse(saved[1]).state.recoveryInfo, undefined);
  // 兼容早期包意外带入的临时标记，不能据此把空白目标局判成损坏。
  exported.state.recoveryInfo = { source: 'backup', message: '旧标记' };
  await env.call('importSession', { gameId: 'clean', json: JSON.stringify(exported) });
  assert.equal(env.getState('clean').extraInfo, '备份数据'); assert.equal(env.getState('clean').recoveryInfo, undefined);
  assert.equal(env.files.get(env.api.statePath('damaged')), '{损坏'); env.cleanup();
});
