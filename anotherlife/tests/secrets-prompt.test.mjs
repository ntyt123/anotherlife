import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {SECRETS_RULES, SECRETS_REFRESH_RULES} from '../lib/prompt-defaults.mjs';
import {initPromptStore, registerPromptDefaults, listPrompts, savePrompt, resetPrompt, promptBlock, loadPrompts} from '../lib/prompt-overrides.mjs';

const files = {};
const mountStore = () => initPromptStore('C:/fake-workspace/', {read: async (p) => files[p] || '', write: async (p, body) => { files[p] = body; }});

test('私密规则默认文本保留原内容与两条边界', () => {
  assert.match(SECRETS_RULES, /【情事与身体 · 只在剧情真涉及时才写】/);
  assert.match(SECRETS_RULES, /新角色建档时就把这四项的初值给出来/);
  assert.match(SECRETS_RULES, /不许套模板/);
  assert.match(SECRETS_RULES, /未满 10 岁的角色，这四项一律留空/);
  assert.match(SECRETS_RULES, /性癖：\*\*只写名词\*\*/);
  assert.ok(SECRETS_RULES.split('\n').length > 25);
  assert.match(SECRETS_REFRESH_RULES, /补录某个角色的私密设定/);
  assert.match(SECRETS_REFRESH_RULES, /未满 10 岁就全部留空/);
});

test('提示词栏能列出两条私密规则，默认即当前版本', async () => {
  mountStore();
  registerPromptDefaults({secrets: SECRETS_RULES, secretsRefresh: SECRETS_REFRESH_RULES});
  await loadPrompts();
  const list = listPrompts();
  for (const key of ['secrets', 'secretsRefresh']) {
    const item = list.find((x) => x.key === key);
    assert.ok(item, key + ' 应出现在列表里');
    assert.ok(item.default.length > 100, key + ' 默认文本不为空');
    assert.equal(item.text, '');
    assert.equal(item.modified, false);
  }
  assert.match(list.find((x) => x.key === 'secrets').label, /私密/);
});

test('保存覆盖后结算使用覆盖文本，重置后回到默认', async () => {
  mountStore();
  registerPromptDefaults({secrets: SECRETS_RULES, secretsRefresh: SECRETS_REFRESH_RULES});
  await loadPrompts();
  const lines = SECRETS_RULES.split('\n');
  assert.deepEqual(promptBlock('secrets', lines), lines);
  await savePrompt('secrets', '【情事与身体 · 改写测试】\n- 只写测试这一行');
  await loadPrompts();
  assert.deepEqual(promptBlock('secrets', lines), ['【情事与身体 · 改写测试】', '- 只写测试这一行']);
  assert.equal(listPrompts().find((x) => x.key === 'secrets').modified, true);
  await resetPrompt('secrets');
  await loadPrompts();
  assert.deepEqual(promptBlock('secrets', lines), lines);
  assert.equal(listPrompts().find((x) => x.key === 'secrets').modified, false);
});

test('结算请求实际带上私密规则段', async () => {
  const reply = (r) => (async function* () {
    const sy = String(r.system || '');
    if (sy.includes('后台变量结算器')) yield {type: 'text-delta', index: 0, text: '{"world":{},"summary":"x"}'};
    else yield {type: 'text-delta', index: 0, text: '门开了。'};
    yield {type: 'finish', reason: {kind: 'stop'}};
  })();
  const e = await createHarness({stream: reply});
  try {
    const s = e.api.defaultState();
    s.gameId = 'test'; s.phase = 'play'; s.simulation = {enabled: false};
    s.protagonist.姓名 = '样本'; s.npcs = []; s.world.当前日期时间 = '2010年11月1日 12:00:00 晴';
    s.config.body = {provider: 'test', model: 'test'}; s.config.bodyMinWords = 4000;
    s.config.settle = {provider: 'test', model: 'test'}; s.config.toolMode = false;
    s.story.current_message_index = 1;
    s.story.dataCompletion = {wardrobes: {[JSON.stringify(['protagonist', '样本'])]: true}, attempted: {}};
    s.transcript = [{seq: 0, role: 'assistant', body: '开局。', diffs: [], issues: [], options: []}];
    e.seed('test', s);
    await e.call('generateStory', {gameId: 'test', input: '继续。'});
    const sys = e.requests.map((r) => String(r.system || '')).join('\n');
    assert.match(sys, /【情事与身体 · 只在剧情真涉及时才写】/);
    assert.match(sys, /未满 10 岁的角色，这四项一律留空/);
  } finally {
    e.cleanup();
  }
});
